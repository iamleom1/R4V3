import type { EventRecord } from "../../types/domain";

const HIDDEN_LOCATION_PATTERNS = ["revealed", "reveal day", "day-of", "day of", "secret location"];
const STATE_ZIP_PATTERN = /^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/;

function normalizeLocationValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function extractDisplayCity(value: string) {
  const normalized = normalizeLocationValue(value);
  if (!normalized) {
    return "";
  }

  const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const trailing = parts[parts.length - 1]?.toUpperCase() ?? "";
    if (STATE_ZIP_PATTERN.test(trailing)) {
      return parts[parts.length - 2] ?? normalized;
    }
    if (/^[A-Z]{2}$/.test(trailing)) {
      return parts[parts.length - 2] ?? normalized;
    }
  }

  if (STATE_ZIP_PATTERN.test(normalized.toUpperCase())) {
    return "";
  }

  return normalized.replace(/\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i, "").trim() || normalized;
}

export function isHiddenEventLocation(value: string | null | undefined) {
  const normalized = normalizeLocationValue(value).toLowerCase();
  if (!normalized) return false;
  return HIDDEN_LOCATION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function getEventLocationSummary(event: EventRecord) {
  if (isHiddenEventLocation(event.city)) {
    return "Location TBA";
  }
  return extractDisplayCity(event.city ?? "") || "City TBD";
}

export function getEventLocationInfo(event: EventRecord) {
  if (isHiddenEventLocation(event.city)) {
    return { label: "Location", value: "TBA (revealed day of event)" };
  }
  return { label: "City", value: extractDisplayCity(event.city ?? "") || "TBA" };
}
