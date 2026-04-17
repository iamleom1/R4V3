import { createClient } from "@supabase/supabase-js";
import { analyzeEventQuality } from "./lib/event-quality.mjs";

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});

const MAX_RUN_AGE_HOURS = clampInteger(process.env.EDM_HEALTHCHECK_MAX_RUN_AGE_HOURS, 30, 1, 168);
const MIN_FETCHED_EVENTS = clampInteger(process.env.EDM_HEALTHCHECK_MIN_FETCHED, 4, 0, 1000);
const MIN_POSH_UPCOMING = clampInteger(process.env.EDM_HEALTHCHECK_MIN_POSH_UPCOMING, 2, 0, 1000);
const MIN_DICE_UPCOMING = clampInteger(process.env.EDM_HEALTHCHECK_MIN_DICE_UPCOMING, 1, 0, 1000);
const MIN_POSH_FETCHED_PER_RUN = clampInteger(process.env.EDM_HEALTHCHECK_MIN_POSH_FETCHED_PER_RUN, 1, 0, 1000);
const MIN_DICE_FETCHED_PER_RUN = clampInteger(process.env.EDM_HEALTHCHECK_MIN_DICE_FETCHED_PER_RUN, 1, 0, 1000);
const MAX_DUPLICATE_EVENTS = clampInteger(process.env.EDM_HEALTHCHECK_MAX_DUPLICATES, 0, 0, 1000);
const MAX_BAD_EVENTS = clampInteger(process.env.EDM_HEALTHCHECK_MAX_BAD_EVENTS, 0, 0, 1000);
async function main() {
  const latestRun = await fetchLatestRun("ingest-edm-events");
  const sourceCounts = await fetchUpcomingCounts();
  const upcomingEvents = await fetchUpcomingImportedEvents();
  const quality = analyzeEventQuality(upcomingEvents);
  const issues = evaluateHealth(latestRun, sourceCounts, quality);
  const activeIssueKeys = new Set(issues.map(toIssueKey));

  const payload = {
    ok: issues.length === 0,
    checkedAt: new Date().toISOString(),
    latestRun,
    sourceCounts,
    quality,
    issues
  };

  await resolveRecoveredAlerts(activeIssueKeys);

  if (issues.length === 0) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await Promise.all(issues.map((issue) => createAlert(issue, payload)));
  await sendSlackAlert(payload);
  await sendEmailAlert(payload);

  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
}

async function fetchLatestRun(jobName) {
  const { data, error } = await supabase
    .from("job_runs")
    .select("job_name,status,details,created_at")
    .eq("job_name", jobName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch latest ingest job: ${error.message}`);
  }

  return data
    ? {
        status: data.status,
        createdAt: data.created_at,
        details: data.details ?? {}
      }
    : null;
}

async function fetchUpcomingCounts() {
  const nowIso = new Date().toISOString();
  const counts = {};

  for (const source of ["posh", "dice"]) {
    const { count, error } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("source_primary", source)
      .gte("starts_at", nowIso);

    if (error) {
      throw new Error(`Failed to count upcoming ${source} events: ${error.message}`);
    }

    counts[source] = count ?? 0;
  }

  return counts;
}

function evaluateHealth(latestRun, sourceCounts, quality) {
  const issues = [];

  if (!latestRun) {
    issues.push({
      category: "edm_scraper_job_health",
      severity: "critical",
      message: "EDM ingest has never run",
      details: {}
    });
  }
  if (latestRun) {
    const ageHours = (Date.now() - new Date(latestRun.createdAt).getTime()) / (1000 * 60 * 60);
    if (latestRun.status !== "success") {
      issues.push({
        category: "edm_scraper_job_health",
        severity: "critical",
        message: "EDM ingest latest run failed",
        details: latestRun
      });
    }

    if (ageHours > MAX_RUN_AGE_HOURS) {
      issues.push({
        category: "edm_scraper_job_health",
        severity: "critical",
        message: "EDM ingest is stale",
        details: { maxRunAgeHours: MAX_RUN_AGE_HOURS, ageHours, latestRun }
      });
    }

    const fetched = Number(latestRun.details?.fetched ?? 0);
    if (fetched < MIN_FETCHED_EVENTS) {
      issues.push({
        category: "edm_scraper_volume",
        severity: "warning",
        message: "EDM ingest fetched count below threshold",
        details: { fetched, minimumFetched: MIN_FETCHED_EVENTS, latestRun }
      });
    }
  }

  const bySource = latestRun?.details?.by_source ?? latestRun?.details?.bySource ?? {};

  if (Number(bySource.posh ?? 0) < MIN_POSH_FETCHED_PER_RUN) {
    issues.push({
      category: "edm_scraper_source_fetch",
      severity: "warning",
      message: "POSH fetched count below per-run threshold",
      details: { fetchedPosh: Number(bySource.posh ?? 0), minimumFetchedPosh: MIN_POSH_FETCHED_PER_RUN }
    });
  }

  if (Number(bySource.dice ?? 0) < MIN_DICE_FETCHED_PER_RUN) {
    issues.push({
      category: "edm_scraper_source_fetch",
      severity: "warning",
      message: "DICE fetched count below per-run threshold",
      details: { fetchedDice: Number(bySource.dice ?? 0), minimumFetchedDice: MIN_DICE_FETCHED_PER_RUN }
    });
  }

  if ((sourceCounts.posh ?? 0) < MIN_POSH_UPCOMING) {
    issues.push({
      category: "edm_scraper_inventory",
      severity: "warning",
      message: "Upcoming Posh events below threshold",
      details: { upcomingPosh: sourceCounts.posh ?? 0, minimumUpcomingPosh: MIN_POSH_UPCOMING }
    });
  }

  if ((sourceCounts.dice ?? 0) < MIN_DICE_UPCOMING) {
    issues.push({
      category: "edm_scraper_inventory",
      severity: "warning",
      message: "Upcoming DICE events below threshold",
      details: { upcomingDice: sourceCounts.dice ?? 0, minimumUpcomingDice: MIN_DICE_UPCOMING }
    });
  }

  if ((quality.duplicateCount ?? 0) > MAX_DUPLICATE_EVENTS) {
    issues.push({
      category: "edm_scraper_quality",
      severity: "warning",
      message: "Duplicate EDM events detected",
      details: {
        duplicateCount: quality.duplicateCount,
        maximumDuplicates: MAX_DUPLICATE_EVENTS,
        sample: quality.duplicates.slice(0, 5)
      }
    });
  }

  if ((quality.badEventCount ?? 0) > MAX_BAD_EVENTS) {
    issues.push({
      category: "edm_scraper_quality",
      severity: "warning",
      message: "Bad EDM events detected",
      details: {
        badEventCount: quality.badEventCount,
        maximumBadEvents: MAX_BAD_EVENTS,
        sample: quality.badEvents.slice(0, 5)
      }
    });
  }

  return issues;
}

async function fetchUpcomingImportedEvents() {
  const nowIso = new Date().toISOString();
  const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("id,title,venue_name,city,starts_at,source_primary")
    .in("source_primary", ["posh", "dice"])
    .gte("starts_at", nowIso)
    .lte("starts_at", ninetyDaysOut)
    .limit(5000);

  if (error) {
    throw new Error(`Failed to load imported EDM events for quality checks: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    provider: row.source_primary,
    providerEventId: row.id,
    title: row.title,
    venueName: row.venue_name,
    city: row.city,
    startsAt: row.starts_at
  }));
}

async function createAlert(issue, payload) {
  try {
    await supabase.rpc("create_system_alert", {
      p_category: issue.category,
      p_severity: issue.severity,
      p_message: issue.message,
      p_details: { ...issue.details, healthcheck: payload.checkedAt }
    });
  } catch {
    // Alerts are best effort here; notification outputs still carry the failure.
  }
}

async function resolveRecoveredAlerts(activeIssueKeys) {
  const resolvableAlerts = [
    { category: "edm_scraper_job_health", message: "EDM ingest has never run" },
    { category: "edm_scraper_job_health", message: "EDM ingest latest run failed" },
    { category: "edm_scraper_job_health", message: "EDM ingest is stale" },
    { category: "edm_scraper_volume", message: "EDM ingest fetched count below threshold" },
    { category: "edm_scraper_source_fetch", message: "POSH fetched count below per-run threshold" },
    { category: "edm_scraper_source_fetch", message: "DICE fetched count below per-run threshold" },
    { category: "edm_scraper_inventory", message: "Upcoming Posh events below threshold" },
    { category: "edm_scraper_inventory", message: "Upcoming DICE events below threshold" },
    { category: "edm_scraper_quality", message: "Duplicate EDM events detected" },
    { category: "edm_scraper_quality", message: "Bad EDM events detected" }
  ];

  await Promise.all(
    resolvableAlerts
      .filter((issue) => !activeIssueKeys.has(toIssueKey(issue)))
      .map(async (issue) => {
        try {
          await supabase.rpc("resolve_system_alert_by_message", {
            p_category: issue.category,
            p_message: issue.message
          });
        } catch {
          // Best effort cleanup. Healthcheck should still continue.
        }
      })
  );
}

function toIssueKey(issue) {
  return `${issue.category}::${issue.message}`;
}

async function sendSlackAlert(payload) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook || payload.issues.length === 0) {
    return;
  }

  const lines = payload.issues.map((issue) => `• ${issue.message}`);
  await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `EDM scraper healthcheck failed\n${lines.join("\n")}\nLatest fetched: ${payload.latestRun?.details?.fetched ?? "n/a"}`
    })
  }).catch(() => {});
}

async function sendEmailAlert(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  if (!apiKey || !to || !from || payload.issues.length === 0) {
    return;
  }

  const lines = payload.issues.map((issue) => `- ${issue.message}`).join("\n");
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "EDM scraper healthcheck alert",
      text: `The EDM scraper healthcheck detected issues.\n\n${lines}\n\nPayload:\n${JSON.stringify(payload, null, 2)}`
    })
  }).catch(() => {});
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

await main();
