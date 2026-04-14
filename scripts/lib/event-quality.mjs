export function analyzeEventQuality(events) {
  const duplicates = [];
  const badEvents = [];
  const seen = new Map();

  for (const event of events) {
    const issues = [];
    if (!hasText(event?.title)) {
      issues.push("missing_title");
    }
    if (!hasText(event?.venueName)) {
      issues.push("missing_venue");
    }
    if (!hasText(event?.city)) {
      issues.push("missing_city");
    }
    if (!isValidIsoDate(event?.startsAt)) {
      issues.push("invalid_starts_at");
    }

    if (issues.length > 0) {
      badEvents.push({
        provider: event?.provider ?? null,
        providerEventId: event?.providerEventId ?? null,
        title: event?.title ?? null,
        issues
      });
      continue;
    }

    const key = duplicateKeyForEvent(event);
    const existing = seen.get(key);
    if (existing) {
      duplicates.push({
        key,
        first: summarizeEvent(existing),
        duplicate: summarizeEvent(event)
      });
      continue;
    }

    seen.set(key, event);
  }

  return {
    duplicateCount: duplicates.length,
    duplicates,
    badEventCount: badEvents.length,
    badEvents
  };
}

export function duplicateKeyForEvent(event) {
  return [
    normalizeToken(event?.title),
    normalizeToken(event?.venueName),
    normalizeToken(event?.city),
    normalizeMinute(event?.startsAt)
  ].join("::");
}

function summarizeEvent(event) {
  return {
    provider: event?.provider ?? event?.sourcePrimary ?? null,
    providerEventId: event?.providerEventId ?? null,
    title: event?.title ?? null,
    venueName: event?.venueName ?? null,
    city: event?.city ?? null,
    startsAt: event?.startsAt ?? null
  };
}

function normalizeMinute(value) {
  if (!isValidIsoDate(value)) {
    return "";
  }
  return new Date(value).toISOString().slice(0, 16);
}

function normalizeToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}
