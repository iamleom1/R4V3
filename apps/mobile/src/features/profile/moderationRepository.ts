import { getSupabaseClient } from "../../lib/supabase";

export type ModerationQueueItem = {
  queueId: string;
  reportId: string;
  priority: number;
  queueStatus: "queued" | "in_review" | "resolved" | "dismissed";
  reportCategory: string;
  reportDetails: string | null;
  reportedAt: string;
  reporterProfileId: string;
  reporterDisplayName: string;
  targetProfileId: string | null;
  targetDisplayName: string | null;
  messageId: string | null;
  messageBody: string | null;
  assignedTo: string | null;
  targetIsHidden: boolean;
  targetIsSuspended: boolean;
  targetSuspendedUntil: string | null;
};

export type SystemAlert = {
  alertId: string;
  category: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "resolved";
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type AnalyticsSnapshot = {
  totalEvents: number;
  uniqueEventNames: number;
  totalErrors: number;
  fatalErrors: number;
  failedJobs: number;
  openAlerts: number;
  lastEventAt: string | null;
  lastErrorAt: string | null;
};

export type TopAnalyticsEvent = {
  eventName: string;
  totalCount: number;
  uniqueProfiles: number;
  lastSeenAt: string;
};

export type RecentClientError = {
  message: string;
  totalCount: number;
  fatalCount: number;
  lastSeenAt: string;
};

export type ScraperHealthSnapshot = {
  latestStatus: "success" | "failure";
  latestRunAt: string | null;
  latestSuccessAt: string | null;
  latestFetched: number;
  latestInserted: number;
  latestUpdated: number;
  latestBySource: Record<string, number>;
  upcomingPoshEvents: number;
  upcomingDiceEvents: number;
  openAlerts: number;
};

export type ScraperJobRun = {
  status: "success" | "failure";
  createdAt: string;
  fetched: number;
  inserted: number;
  updated: number;
  bySource: Record<string, number>;
};

type QueueRow = {
  queue_id: string;
  report_id: string;
  priority: number;
  queue_status: ModerationQueueItem["queueStatus"];
  report_category: string;
  report_details: string | null;
  reported_at: string;
  reporter_profile_id: string;
  reporter_display_name: string | null;
  target_profile_id: string | null;
  target_display_name: string | null;
  message_id: string | null;
  message_body: string | null;
  assigned_to: string | null;
  target_is_hidden: boolean | null;
  target_is_suspended: boolean | null;
  target_suspended_until: string | null;
};

type AlertRow = {
  alert_id: string;
  category: string;
  severity: SystemAlert["severity"];
  status: SystemAlert["status"];
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type AnalyticsSnapshotRow = {
  total_events: number | string | null;
  unique_event_names: number | string | null;
  total_errors: number | string | null;
  fatal_errors: number | string | null;
  failed_jobs: number | string | null;
  open_alerts: number | string | null;
  last_event_at: string | null;
  last_error_at: string | null;
};

type TopAnalyticsEventRow = {
  event_name: string;
  total_count: number | string;
  unique_profiles: number | string;
  last_seen_at: string;
};

type RecentClientErrorRow = {
  message: string;
  total_count: number | string;
  fatal_count: number | string;
  last_seen_at: string;
};

type ScraperHealthSnapshotRow = {
  latest_status: ScraperHealthSnapshot["latestStatus"] | null;
  latest_run_at: string | null;
  latest_success_at: string | null;
  latest_fetched: number | string | null;
  latest_inserted: number | string | null;
  latest_updated: number | string | null;
  latest_by_source: Record<string, unknown> | null;
  upcoming_posh_events: number | string | null;
  upcoming_dice_events: number | string | null;
  open_alerts: number | string | null;
};

type ScraperJobRunRow = {
  status: ScraperJobRun["status"];
  created_at: string;
  fetched: number | string | null;
  inserted: number | string | null;
  updated: number | string | null;
  by_source: Record<string, unknown> | null;
};

export async function isCurrentUserModerator() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return false;
  }

  const { data, error } = await (supabase.rpc as any)("is_current_user_moderator");
  return !error && Boolean(data);
}

export async function listModerationQueue(status?: ModerationQueueItem["queueStatus"] | "all") {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await (supabase.rpc as any)("list_moderation_queue", {
    p_status: status && status !== "all" ? status : null,
    p_limit: 40
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return (data as QueueRow[]).map((row) => ({
    queueId: row.queue_id,
    reportId: row.report_id,
    priority: row.priority,
    queueStatus: row.queue_status,
    reportCategory: row.report_category,
    reportDetails: row.report_details,
    reportedAt: row.reported_at,
    reporterProfileId: row.reporter_profile_id,
    reporterDisplayName: row.reporter_display_name ?? "R4V3 User",
    targetProfileId: row.target_profile_id,
    targetDisplayName: row.target_display_name,
    messageId: row.message_id,
    messageBody: row.message_body,
    assignedTo: row.assigned_to,
    targetIsHidden: Boolean(row.target_is_hidden),
    targetIsSuspended: Boolean(row.target_is_suspended),
    targetSuspendedUntil: row.target_suspended_until
  }));
}

export async function updateReportStatus(input: {
  reportId: string;
  status: ModerationQueueItem["queueStatus"];
  priority?: number;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { data, error } = await (supabase.rpc as any)("update_report_status", {
    p_report_id: input.reportId,
    p_status: input.status,
    p_priority: typeof input.priority === "number" ? input.priority : null
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return { ok: false as const, error: error?.message ?? "Failed to update report." };
  }

  return {
    ok: true as const,
    reportId: row.report_id as string,
    status: row.status as ModerationQueueItem["queueStatus"],
    priority: Number(row.priority ?? 2),
    assignedTo: (row.assigned_to as string | null) ?? null
  };
}

export async function moderateProfileAction(input: {
  targetProfileId: string;
  actionType: "hide_profile" | "unhide_profile" | "suspend_profile" | "unsuspend_profile";
  note?: string;
  suspendUntil?: string | null;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { data, error } = await (supabase.rpc as any)("moderate_profile_action", {
    p_target_profile_id: input.targetProfileId,
    p_action_type: input.actionType,
    p_note: input.note?.trim() || null,
    p_suspend_until: input.suspendUntil ?? null
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return { ok: false as const, error: error?.message ?? "Failed to update moderation state." };
  }

  return { ok: true as const };
}

export async function listSystemAlerts(status: SystemAlert["status"] | "all" = "open") {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await (supabase.rpc as any)("list_system_alerts", {
    p_status: status === "all" ? null : status,
    p_limit: 50
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return (data as AlertRow[]).map((row) => ({
    alertId: row.alert_id,
    category: row.category,
    severity: row.severity,
    status: row.status,
    message: row.message,
    details: row.details ?? {},
    createdAt: row.created_at
  }));
}

export async function resolveSystemAlert(alertId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { data, error } = await (supabase.rpc as any)("resolve_system_alert", {
    p_alert_id: alertId
  });

  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Failed to resolve alert." };
  }

  return { ok: true as const };
}

export async function getAdminAnalyticsSnapshot(windowHours = 24): Promise<AnalyticsSnapshot | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await (supabase.rpc as any)("get_admin_analytics_snapshot", {
    p_window_hours: windowHours
  });

  const row = (Array.isArray(data) ? data[0] : data) as AnalyticsSnapshotRow | null;
  if (error || !row) {
    return null;
  }

  return {
    totalEvents: Number(row.total_events ?? 0),
    uniqueEventNames: Number(row.unique_event_names ?? 0),
    totalErrors: Number(row.total_errors ?? 0),
    fatalErrors: Number(row.fatal_errors ?? 0),
    failedJobs: Number(row.failed_jobs ?? 0),
    openAlerts: Number(row.open_alerts ?? 0),
    lastEventAt: row.last_event_at,
    lastErrorAt: row.last_error_at
  };
}

export async function listAdminTopEvents(windowHours = 24, limit = 8): Promise<TopAnalyticsEvent[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await (supabase.rpc as any)("list_admin_top_events", {
    p_window_hours: windowHours,
    p_limit: limit
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return (data as TopAnalyticsEventRow[]).map((row) => ({
    eventName: row.event_name,
    totalCount: Number(row.total_count ?? 0),
    uniqueProfiles: Number(row.unique_profiles ?? 0),
    lastSeenAt: row.last_seen_at
  }));
}

export async function listAdminRecentErrors(windowHours = 24, limit = 8): Promise<RecentClientError[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await (supabase.rpc as any)("list_admin_recent_errors", {
    p_window_hours: windowHours,
    p_limit: limit
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return (data as RecentClientErrorRow[]).map((row) => ({
    message: row.message,
    totalCount: Number(row.total_count ?? 0),
    fatalCount: Number(row.fatal_count ?? 0),
    lastSeenAt: row.last_seen_at
  }));
}

export async function getScraperHealthSnapshot(): Promise<ScraperHealthSnapshot | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await (supabase.rpc as any)("get_scraper_health_snapshot");
  const row = (Array.isArray(data) ? data[0] : data) as ScraperHealthSnapshotRow | null;
  if (error || !row || !row.latest_status) {
    return null;
  }

  return {
    latestStatus: row.latest_status,
    latestRunAt: row.latest_run_at,
    latestSuccessAt: row.latest_success_at,
    latestFetched: Number(row.latest_fetched ?? 0),
    latestInserted: Number(row.latest_inserted ?? 0),
    latestUpdated: Number(row.latest_updated ?? 0),
    latestBySource: coerceNumericRecord(row.latest_by_source),
    upcomingPoshEvents: Number(row.upcoming_posh_events ?? 0),
    upcomingDiceEvents: Number(row.upcoming_dice_events ?? 0),
    openAlerts: Number(row.open_alerts ?? 0)
  };
}

export async function listScraperJobRuns(limit = 10): Promise<ScraperJobRun[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await (supabase.rpc as any)("list_scraper_job_runs", {
    p_limit: limit
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return (data as ScraperJobRunRow[]).map((row) => ({
    status: row.status,
    createdAt: row.created_at,
    fetched: Number(row.fetched ?? 0),
    inserted: Number(row.inserted ?? 0),
    updated: Number(row.updated ?? 0),
    bySource: coerceNumericRecord(row.by_source)
  }));
}

function coerceNumericRecord(value: Record<string, unknown> | null | undefined) {
  const entries = Object.entries(value ?? {});
  return entries.reduce<Record<string, number>>((acc, [key, item]) => {
    acc[key] = Number(item ?? 0);
    return acc;
  }, {});
}
