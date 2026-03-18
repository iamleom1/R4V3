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
    assignedTo: row.assigned_to
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
