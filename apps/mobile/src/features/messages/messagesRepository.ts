import { getSupabaseClient } from "../../lib/supabase";

export type ConversationListItem = {
  matchId: string;
  mode: "community" | "dating";
  eventName: string | null;
  otherProfileId: string;
  otherDisplayName: string;
  otherCity: string | null;
  otherVibeTags: string[];
  matchedAt: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastMessageSenderProfileId: string | null;
  lastReadAt: string | null;
  isUnread: boolean;
};

export type MessageItem = {
  id: string;
  matchId: string;
  senderProfileId: string;
  body: string;
  createdAt: string;
};

export type CreateReportInput = {
  category: string;
  details?: string;
  targetProfileId?: string | null;
  messageId?: string | null;
  eventId?: string | null;
};

type MatchRow = {
  id: string;
  profile_low_id: string;
  profile_high_id: string;
  mode: "community" | "dating";
  event_id: string | null;
  created_at: string;
};

type RpcConversationRow = {
  match_id: string;
  mode: "community" | "dating";
  event_name: string | null;
  other_profile_id: string;
  other_display_name: string | null;
  other_city: string | null;
  other_vibe_tags: string[] | null;
  matched_at: string;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_sender_profile_id: string | null;
  last_read_at: string | null;
  is_unread: boolean | null;
};

export async function listConversations(viewerProfileId: string): Promise<ConversationListItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data: rpcRows, error: rpcError } = await (supabase.rpc as any)("list_conversations", {
    p_limit: 100
  });

  if (!rpcError && Array.isArray(rpcRows)) {
    return (rpcRows as RpcConversationRow[]).map((row) => ({
      matchId: row.match_id,
      mode: row.mode,
      eventName: row.event_name,
      otherProfileId: row.other_profile_id,
      otherDisplayName: row.other_display_name?.trim() || "R4V3 User",
      otherCity: row.other_city,
      otherVibeTags: Array.isArray(row.other_vibe_tags) ? row.other_vibe_tags : [],
      matchedAt: row.matched_at,
      lastMessageBody: row.last_message_body,
      lastMessageAt: row.last_message_at,
      lastMessageSenderProfileId: row.last_message_sender_profile_id,
      lastReadAt: row.last_read_at,
      isUnread: Boolean(row.is_unread)
    }));
  }

  return listConversationsLegacy(viewerProfileId);
}

async function listConversationsLegacy(viewerProfileId: string): Promise<ConversationListItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const matchesTable = supabase.from("matches") as any;
  const { data: matchRows, error } = await matchesTable
    .select("id,profile_low_id,profile_high_id,mode,event_id,created_at")
    .or(`profile_low_id.eq.${viewerProfileId},profile_high_id.eq.${viewerProfileId}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !Array.isArray(matchRows)) {
    return [];
  }

  const matches = matchRows as MatchRow[];
  if (matches.length === 0) {
    return [];
  }

  const otherProfileIds = Array.from(
    new Set(
      matches.map((m) => (m.profile_low_id === viewerProfileId ? m.profile_high_id : m.profile_low_id)).filter(Boolean)
    )
  );
  const eventIds = Array.from(new Set(matches.map((m) => m.event_id).filter(Boolean) as string[]));
  const matchIds = matches.map((m) => m.id);

  const [profilesRes, eventsRes, messagesRes, readStatesRes] = await Promise.all([
    otherProfileIds.length > 0
      ? ((supabase.from("profiles") as any)
          .select("id,display_name,city,vibe_tags")
          .in("id", otherProfileIds) as Promise<{ data: any[] | null; error: any }>)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length > 0
      ? ((supabase.from("events") as any).select("id,title").in("id", eventIds) as Promise<{ data: any[] | null; error: any }>)
      : Promise.resolve({ data: [], error: null }),
    ((supabase.from("messages") as any)
      .select("id,match_id,sender_profile_id,body,created_at")
      .in("match_id", matchIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }) as Promise<{ data: any[] | null; error: any }>),
    ((supabase.from("message_read_states") as any)
      .select("match_id,last_read_at")
      .eq("profile_id", viewerProfileId)
      .in("match_id", matchIds) as Promise<{ data: any[] | null; error: any }>)
  ]);

  const profileById = new Map<string, any>();
  if (Array.isArray(profilesRes.data)) {
    for (const row of profilesRes.data) {
      if (row?.id) {
        profileById.set(row.id, row);
      }
    }
  }

  const eventById = new Map<string, any>();
  if (Array.isArray(eventsRes.data)) {
    for (const row of eventsRes.data) {
      if (row?.id) {
        eventById.set(row.id, row);
      }
    }
  }

  const latestMessageByMatchId = new Map<string, any>();
  if (Array.isArray(messagesRes.data)) {
    for (const row of messagesRes.data) {
      if (!row?.match_id || latestMessageByMatchId.has(row.match_id)) {
        continue;
      }
      latestMessageByMatchId.set(row.match_id, row);
    }
  }

  const readStateByMatchId = new Map<string, string | null>();
  if (Array.isArray(readStatesRes.data)) {
    for (const row of readStatesRes.data) {
      if (!row?.match_id) {
        continue;
      }
      readStateByMatchId.set(row.match_id, (row.last_read_at as string | null) ?? null);
    }
  }

  return matches.map((match) => {
    const otherProfileId = match.profile_low_id === viewerProfileId ? match.profile_high_id : match.profile_low_id;
    const other = profileById.get(otherProfileId);
    const event = match.event_id ? eventById.get(match.event_id) : null;
    const latest = latestMessageByMatchId.get(match.id);
    const lastReadAt = readStateByMatchId.get(match.id) ?? null;
    const lastMessageAt = (latest?.created_at as string | null) ?? null;
    const lastMessageSenderProfileId = (latest?.sender_profile_id as string | null) ?? null;
    const lastMessageAtMs = lastMessageAt ? new Date(lastMessageAt).getTime() : null;
    const lastReadAtMs = lastReadAt ? new Date(lastReadAt).getTime() : null;
    const isUnread =
      lastMessageAtMs !== null &&
      lastMessageSenderProfileId !== null &&
      lastMessageSenderProfileId !== viewerProfileId &&
      (lastReadAtMs === null || lastMessageAtMs > lastReadAtMs);

    return {
      matchId: match.id,
      mode: match.mode,
      eventName: event?.title ?? null,
      otherProfileId,
      otherDisplayName: other?.display_name ?? "R4V3 User",
      otherCity: other?.city ?? null,
      otherVibeTags: Array.isArray(other?.vibe_tags) ? other.vibe_tags : [],
      matchedAt: match.created_at,
      lastMessageBody: latest?.body ?? null,
      lastMessageAt,
      lastMessageSenderProfileId,
      lastReadAt,
      isUnread
    } satisfies ConversationListItem;
  });
}

export async function listMessages(matchId: string, _viewerProfileId: string): Promise<MessageItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const messagesTable = supabase.from("messages") as any;
  const { data, error } = await messagesTable
    .select("id,match_id,sender_profile_id,body,created_at")
    .eq("match_id", matchId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    matchId: row.match_id,
    senderProfileId: row.sender_profile_id,
    body: row.body,
    createdAt: row.created_at
  }));
}

export async function sendMessage(input: { matchId: string; senderProfileId: string; body: string }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const text = input.body.trim();
  if (!text) {
    return { ok: false as const, error: "Message cannot be empty." };
  }

  const { data, error } = await (supabase.rpc as any)("send_match_message", {
    p_match_id: input.matchId,
    p_body: text
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return { ok: false as const, error: error?.message ?? "Failed to send message." };
  }

  return {
    ok: true as const,
    message: {
      id: row.id as string,
      matchId: row.match_id as string,
      senderProfileId: row.sender_profile_id as string,
      body: row.body as string,
      createdAt: row.created_at as string
    } satisfies MessageItem
  };
}

export async function markConversationRead(matchId: string, _viewerProfileId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { error } = await (supabase.rpc as any)("mark_match_messages_read", { p_match_id: matchId });
  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

export async function createReport(input: CreateReportInput) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const category = input.category.trim();
  if (!category) {
    return { ok: false as const, error: "Report category is required." };
  }

  const { data, error } = await (supabase.rpc as any)("create_report", {
    p_category: category,
    p_details: input.details?.trim() || null,
    p_target_profile_id: input.targetProfileId ?? null,
    p_message_id: input.messageId ?? null,
    p_event_id: input.eventId ?? null
  });

  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Failed to submit report." };
  }

  return {
    ok: true as const,
    reportId: data as string
  };
}
