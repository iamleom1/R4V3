import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("BACKEND_MAINTENANCE_CRON_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
      return json({ error: "Server is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (bearer !== cronSecret && bearer !== serviceRoleKey) {
      return json({ error: "Unauthorized." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const maxIngestAgeHours = Number(body?.maxIngestAgeHours ?? 18);
    const maxPruneAgeHours = Number(body?.maxPruneAgeHours ?? 30);
    const minimumUpcomingEvents = Number(body?.minimumUpcomingEvents ?? 5);
    const maxEdmIngestAgeHours = Number(body?.maxEdmIngestAgeHours ?? 18);
    const minimumEdmFetched = Number(body?.minimumEdmFetched ?? 4);
    const minimumUpcomingPoshEvents = Number(body?.minimumUpcomingPoshEvents ?? 2);
    const minimumUpcomingDiceEvents = Number(body?.minimumUpcomingDiceEvents ?? 1);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const alerts: Array<Record<string, unknown>> = [];
    const activeAlertKeys = new Set<string>();

    const [{ data: jobRuns }, { count: upcomingEventsCount }] = await Promise.all([
      (admin.from("job_runs") as any)
        .select("job_name,status,details,created_at")
        .in("job_name", ["ingest-events", "prune-events", "ingest-edm-events"])
        .order("created_at", { ascending: false })
        .limit(20),
      (admin.from("events") as any)
        .select("id", { count: "exact", head: true })
        .gte("starts_at", new Date().toISOString())
    ]);

    const latestByJob = new Map<string, any>();
    for (const row of jobRuns ?? []) {
      if (!row?.job_name || latestByJob.has(row.job_name)) continue;
      latestByJob.set(row.job_name, row);
    }

    for (const rule of [
      { name: "ingest-events", maxAgeHours: maxIngestAgeHours },
      { name: "prune-events", maxAgeHours: maxPruneAgeHours },
      { name: "ingest-edm-events", maxAgeHours: maxEdmIngestAgeHours }
    ]) {
      const latest = latestByJob.get(rule.name);
      const createdAt = latest?.created_at ? new Date(latest.created_at) : null;
      const ageHours = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
      if (!latest || latest.status !== "success" || ageHours > rule.maxAgeHours) {
        const message = `${rule.name} stale or failing`;
        await (admin.rpc as any)("create_system_alert", {
          p_category: "job_health",
          p_severity: "critical",
          p_message: message,
          p_details: {
            job_name: rule.name,
            latest_status: latest?.status ?? null,
            latest_run_at: latest?.created_at ?? null,
            latest_details: latest?.details ?? {},
            max_age_hours: rule.maxAgeHours
          }
        });
        alerts.push({ type: "job_health", jobName: rule.name });
      }
    }

    const latestEdmRun = latestByJob.get("ingest-edm-events");
    const latestEdmFetched = Number(latestEdmRun?.details?.fetched ?? 0);
    if (latestEdmRun?.status === "success" && latestEdmFetched < minimumEdmFetched) {
      activeAlertKeys.add(issueKey("edm_scraper_volume", "EDM ingest fetched count below threshold"));
      await (admin.rpc as any)("create_system_alert", {
        p_category: "edm_scraper_volume",
        p_severity: "warning",
        p_message: "EDM ingest fetched count below threshold",
        p_details: {
          fetched: latestEdmFetched,
          minimum_fetched: minimumEdmFetched,
          latest_run_at: latestEdmRun?.created_at ?? null
        }
      });
      alerts.push({ type: "edm_scraper_volume", fetched: latestEdmFetched });
    }

    if ((upcomingEventsCount ?? 0) < minimumUpcomingEvents) {
      const message = "upcoming events below threshold";
      await (admin.rpc as any)("create_system_alert", {
        p_category: "event_inventory",
        p_severity: "warning",
        p_message: message,
        p_details: {
          upcoming_events: upcomingEventsCount ?? 0,
          minimum_upcoming_events: minimumUpcomingEvents
        }
      });
      alerts.push({ type: "event_inventory", upcomingEvents: upcomingEventsCount ?? 0 });
    }

    const [{ count: upcomingPoshCount }, { count: upcomingDiceCount }] = await Promise.all([
      (admin.from("events") as any)
        .select("id", { count: "exact", head: true })
        .eq("source_primary", "posh")
        .gte("starts_at", new Date().toISOString()),
      (admin.from("events") as any)
        .select("id", { count: "exact", head: true })
        .eq("source_primary", "dice")
        .gte("starts_at", new Date().toISOString())
    ]);

    if ((upcomingPoshCount ?? 0) < minimumUpcomingPoshEvents) {
      activeAlertKeys.add(issueKey("edm_scraper_inventory", "Upcoming Posh events below threshold"));
      await (admin.rpc as any)("create_system_alert", {
        p_category: "edm_scraper_inventory",
        p_severity: "warning",
        p_message: "Upcoming Posh events below threshold",
        p_details: {
          upcoming_posh_events: upcomingPoshCount ?? 0,
          minimum_upcoming_posh_events: minimumUpcomingPoshEvents
        }
      });
      alerts.push({ type: "edm_posh_inventory", upcomingPoshCount: upcomingPoshCount ?? 0 });
    }

    if ((upcomingDiceCount ?? 0) < minimumUpcomingDiceEvents) {
      activeAlertKeys.add(issueKey("edm_scraper_inventory", "Upcoming DICE events below threshold"));
      await (admin.rpc as any)("create_system_alert", {
        p_category: "edm_scraper_inventory",
        p_severity: "warning",
        p_message: "Upcoming DICE events below threshold",
        p_details: {
          upcoming_dice_events: upcomingDiceCount ?? 0,
          minimum_upcoming_dice_events: minimumUpcomingDiceEvents
        }
      });
      alerts.push({ type: "edm_dice_inventory", upcomingDiceCount: upcomingDiceCount ?? 0 });
    }

    const edmJobIssues = [
      {
        triggered:
          !latestEdmRun ||
          latestEdmRun.status !== "success" ||
          (latestEdmRun?.created_at
            ? (Date.now() - new Date(latestEdmRun.created_at).getTime()) / (1000 * 60 * 60) > maxEdmIngestAgeHours
            : true),
        category: "edm_scraper_job_health",
        message:
          !latestEdmRun
            ? "EDM ingest has never run"
            : latestEdmRun.status !== "success"
              ? "EDM ingest latest run failed"
              : "EDM ingest is stale"
      }
    ];

    for (const issue of edmJobIssues) {
      if (issue.triggered) {
        activeAlertKeys.add(issueKey(issue.category, issue.message));
      }
    }

    await resolveRecoveredEdmAlerts(admin, activeAlertKeys);

    await (admin.rpc as any)("record_job_run", {
      p_job_name: "ops-monitor",
      p_status: "success",
      p_details: {
        alerts_created: alerts.length,
        upcoming_events: upcomingEventsCount ?? 0
      }
    });

    return json({
      ok: true,
      alertsCreated: alerts.length,
      upcomingEvents: upcomingEventsCount ?? 0,
      alerts
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function issueKey(category: string, message: string) {
  return `${category}::${message}`;
}

async function resolveRecoveredEdmAlerts(
  admin: ReturnType<typeof createClient>,
  activeAlertKeys: Set<string>
) {
  const resolvableAlerts = [
    { category: "edm_scraper_job_health", message: "EDM ingest has never run" },
    { category: "edm_scraper_job_health", message: "EDM ingest latest run failed" },
    { category: "edm_scraper_job_health", message: "EDM ingest is stale" },
    { category: "edm_scraper_volume", message: "EDM ingest fetched count below threshold" },
    { category: "edm_scraper_inventory", message: "Upcoming Posh events below threshold" },
    { category: "edm_scraper_inventory", message: "Upcoming DICE events below threshold" }
  ];

  for (const issue of resolvableAlerts) {
    if (activeAlertKeys.has(issueKey(issue.category, issue.message))) {
      continue;
    }

    await (admin.rpc as any)("resolve_system_alert_by_message", {
      p_category: issue.category,
      p_message: issue.message
    });
  }
}
