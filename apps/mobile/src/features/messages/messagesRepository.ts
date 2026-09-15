import { MESSAGE_PAGE_SIZE, type HistoryCursor } from "./useMessageHistory";
import { getSupabaseClient } from "../../lib/supabase";
import { trackEvent } from "../../lib/telemetry";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { listPrimaryProfilePhotoUrls } from "../profile/photoRepository";

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
  otherProfilePhotoUrl?: string | null;
};

export type MessageItem = {
  id: string;
  matchId: string;
  senderProfileId: string;
  body: string;
  createdAt: string;
};

export type CrewGroupListItem = {
  id: string;
  title: string;
  createdAt: string;
  memberCount: number;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
};

export type CrewGroupMessage = {
  id: string;
  groupId: string;
  senderProfileId: string;
  body: string;
  createdAt: string;
};

export type GroupChatCandidate = {
  profileId: string;
  displayName: string;
  city: string | null;
  photoUrl?: string | null;
};

export type CrewGroupMember = {
  profileId: string;
  displayName: string;
  city: string | null;
};

export type CreateReportInput = {
  category: string;
  details?: string;
  targetProfileId?: string | null;
  messageId?: string | null;
  eventId?: string | null;
};

type BlockRow = {
  blocker_profile_id: string;
  blocked_profile_id: string;
};

type MatchRow = {
  id: string;
  profile_low_id: string;
  profile_high_id: string;
  mode: "community" | "dating";
  event_id: string | null;
  created_at: string;
};

type HiddenConversationRow = {
  match_id: string;
  hidden_before_at: string;
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
    throw new Error("Supabase is not configured.");
  }

  const blockedProfileIds = await listBlockedProfileIds(viewerProfileId);

  const { data: rpcRows, error: rpcError } = await (supabase.rpc as any)("list_conversations", {
    p_limit: 100
  });

  if (!rpcError && Array.isArray(rpcRows)) {
    const rows = (rpcRows as RpcConversationRow[])
      .filter((row) => !blockedProfileIds.has(row.other_profile_id))
      .map((row) => ({
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
        isUnread: Boolean(row.is_unread),
        otherProfilePhotoUrl: null
      }));
    const photoUrls = await listPrimaryProfilePhotoUrls(rows.map((row) => row.otherProfileId));
    return rows.map((row) => ({
      ...row,
      otherProfilePhotoUrl: photoUrls[row.otherProfileId] ?? null
    }));
  }

  return listConversationsLegacy(viewerProfileId, blockedProfileIds);
}

async function listConversationsLegacy(viewerProfileId: string, blockedProfileIds: Set<string>): Promise<ConversationListItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const matchesTable = supabase.from("matches") as any;
  const { data: matchRows, error } = await matchesTable
    .select("id,profile_low_id,profile_high_id,mode,event_id,created_at")
    .or(`profile_low_id.eq.${viewerProfileId},profile_high_id.eq.${viewerProfileId}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !Array.isArray(matchRows)) {
    throw new Error(error?.message ?? "Failed to load conversations.");
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

  const { data: hiddenRows } = await ((supabase.from("conversation_hidden_states") as any)
    .select("match_id,hidden_before_at")
    .eq("profile_id", viewerProfileId)
    .in("match_id", matchIds) as Promise<{ data: HiddenConversationRow[] | null; error: any }>);

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

  const hiddenBeforeByMatchId = new Map<string, string>();
  if (Array.isArray(hiddenRows)) {
    for (const row of hiddenRows) {
      if (row?.match_id && row.hidden_before_at) {
        hiddenBeforeByMatchId.set(row.match_id, row.hidden_before_at);
      }
    }
  }

  const rows = matches
    .map((match) => {
      const otherProfileId = match.profile_low_id === viewerProfileId ? match.profile_high_id : match.profile_low_id;
      if (blockedProfileIds.has(otherProfileId)) {
        return null;
      }

      const other = profileById.get(otherProfileId);
      const event = match.event_id ? eventById.get(match.event_id) : null;
      const latest = latestMessageByMatchId.get(match.id);
      const lastReadAt = readStateByMatchId.get(match.id) ?? null;
      const lastMessageAt = (latest?.created_at as string | null) ?? null;
      const lastMessageSenderProfileId = (latest?.sender_profile_id as string | null) ?? null;
      const latestActivityAt = lastMessageAt ?? match.created_at;
      const lastMessageAtMs = lastMessageAt ? new Date(lastMessageAt).getTime() : null;
      const lastReadAtMs = lastReadAt ? new Date(lastReadAt).getTime() : null;
      const hiddenBeforeAt = hiddenBeforeByMatchId.get(match.id) ?? null;
      const hiddenBeforeAtMs = hiddenBeforeAt ? new Date(hiddenBeforeAt).getTime() : null;
      const isUnread =
        lastMessageAtMs !== null &&
        lastMessageSenderProfileId !== null &&
        lastMessageSenderProfileId !== viewerProfileId &&
        (lastReadAtMs === null || lastMessageAtMs > lastReadAtMs);

      if (hiddenBeforeAtMs !== null && new Date(latestActivityAt).getTime() <= hiddenBeforeAtMs) {
        return null;
      }

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
        isUnread,
        otherProfilePhotoUrl: null
      } satisfies ConversationListItem;
    })
    .filter(Boolean) as ConversationListItem[];

  const photoUrls = await listPrimaryProfilePhotoUrls(rows.map((row) => row.otherProfileId));
  return rows.map((row) => ({
    ...row,
    otherProfilePhotoUrl: photoUrls[row.otherProfileId] ?? null
  }));
}

export async function listMessages(matchId: string, _viewerProfileId: string, before?: HistoryCursor): Promise<MessageItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const messagesTable = supabase.from("messages") as any;
  let query = messagesTable
    .select("id,match_id,sender_profile_id,body,created_at")
    .eq("match_id", matchId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (before) query = query.or(`created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`);
  const { data, error } = await query;

  if (error || !Array.isArray(data)) {
    throw new Error(error?.message ?? "Failed to load messages.");
  }

  return data.reverse().map((row: any) => ({
    id: row.id,
    matchId: row.match_id,
    senderProfileId: row.sender_profile_id,
    body: row.body,
    createdAt: row.created_at
  }));
}

export async function ensureDirectCrewGroup(otherProfileId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { data, error } = await (supabase.rpc as any)("ensure_direct_crew_group", {
    p_other_profile_id: otherProfileId
  });

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to create crew group.") };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.group_id) {
    return { ok: false as const, error: "Failed to create crew group." };
  }

  return {
    ok: true as const,
    group: {
      id: row.group_id as string,
      createdAt: row.created_at as string
    }
  };
}

export async function createCrewGroup(input: { title?: string; memberIds: string[] }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const uniqueMemberIds = Array.from(new Set(input.memberIds.filter(Boolean)));
  if (uniqueMemberIds.length === 0) {
    return { ok: false as const, error: "Select at least one other member." };
  }

  const { data, error } = await (supabase.rpc as any)("create_crew_group", {
    p_title: input.title?.trim() || null,
    p_member_ids: uniqueMemberIds
  });

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to create group chat.") };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.group_id) {
    return { ok: false as const, error: "Failed to create group chat." };
  }

  void trackEvent("crew_group_created", {
    member_count: uniqueMemberIds.length + 1,
    has_custom_title: Boolean(input.title?.trim())
  });

  return {
    ok: true as const,
    group: {
      id: row.group_id as string,
      createdAt: row.created_at as string
    }
  };
}

export async function listGroupChatCandidates(viewerProfileId: string): Promise<GroupChatCandidate[]> {
  const conversations = await listConversations(viewerProfileId);
  return conversations.map((item) => ({
    profileId: item.otherProfileId,
    displayName: item.otherDisplayName,
    city: item.otherCity,
    photoUrl: item.otherProfilePhotoUrl ?? null
  }));
}

export async function listCrewGroupMembers(groupId: string): Promise<CrewGroupMember[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await (supabase.rpc as any)("list_crew_group_members", {
    p_group_id: groupId
  });

  if (error || !Array.isArray(data)) {
    throw new Error(error?.message ?? "Failed to load crew members.");
  }

  return data.map((row: any) => ({
    profileId: row.profile_id as string,
    displayName: (row.display_name as string | null)?.trim() || "R4V3 User",
    city: (row.city as string | null) ?? null
  }));
}

export async function addCrewGroupMembers(input: { groupId: string; memberIds: string[] }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const uniqueMemberIds = Array.from(new Set(input.memberIds.filter(Boolean)));
  if (uniqueMemberIds.length === 0) {
    return { ok: false as const, error: "Select at least one member." };
  }

  const { data, error } = await (supabase.rpc as any)("add_crew_group_members", {
    p_group_id: input.groupId,
    p_member_ids: uniqueMemberIds
  });

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to add members.") };
  }

  return { ok: true as const, addedCount: Number(data ?? 0) };
}

export async function leaveCrewGroup(groupId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { error } = await (supabase.rpc as any)("leave_crew_group", {
    p_group_id: groupId
  });

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to delete crew chat.") };
  }

  void trackEvent("crew_group_left", {
    group_id: groupId
  });

  return { ok: true as const };
}

export async function listCrewGroups(viewerProfileId: string): Promise<CrewGroupListItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  void viewerProfileId;

  const { data, error } = await (supabase.rpc as any)("list_crew_groups");

  if (error || !Array.isArray(data)) {
    throw new Error(error?.message ?? "Failed to load crew groups.");
  }

  return data.map((row: any) => ({
    id: row.group_id as string,
    title:
      (typeof row.title === "string" ? row.title.trim() : "") ||
      (Array.isArray(row.other_member_names) ? row.other_member_names.filter(Boolean).join(", ") : "") ||
      "Crew chat",
    createdAt: row.created_at as string,
    memberCount: typeof row.member_count === "number" ? row.member_count : Number(row.member_count ?? 0),
    lastMessageBody: (row.last_message_body as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null
  }));
}

export async function listCrewGroupMessages(groupId: string): Promise<CrewGroupMessage[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await ((supabase.from("crew_group_messages") as any)
    .select("id,group_id,sender_profile_id,body,created_at")
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true }));

  if (error || !Array.isArray(data)) {
    throw new Error(error?.message ?? "Failed to load crew messages.");
  }

  return data.map((row: any) => ({
    id: row.id,
    groupId: row.group_id,
    senderProfileId: row.sender_profile_id,
    body: row.body,
    createdAt: row.created_at
  }));
}

export async function sendCrewGroupMessage(input: { groupId: string; senderProfileId: string; body: string }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const text = input.body.trim();
  if (!text) {
    return { ok: false as const, error: "Message cannot be empty." };
  }

  const { data, error } = await ((supabase.from("crew_group_messages") as any)
    .insert({
      group_id: input.groupId,
      sender_profile_id: input.senderProfileId,
      body: text
    })
    .select("id,group_id,sender_profile_id,body,created_at")
    .single());

  if (error || !data) {
    return { ok: false as const, error: toUserFacingError(error?.message, "Failed to send crew message.") };
  }

  void trackEvent("crew_group_message_sent", {
    group_id: input.groupId
  });

  return {
    ok: true as const,
    message: {
      id: data.id,
      groupId: data.group_id,
      senderProfileId: data.sender_profile_id,
      body: data.body,
      createdAt: data.created_at
    } satisfies CrewGroupMessage
  };
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
    return { ok: false as const, error: toUserFacingError(error?.message, "Failed to send message.") };
  }

  void trackEvent("message_sent", {
    match_id: input.matchId
  });

  void supabase.functions.invoke("send-message-push", {
    body: {
      matchId: input.matchId,
      messageId: row.id as string
    }
  }).then(({ error: pushError }) => {
    if (pushError) {
      void trackEvent("push_send_invoke_failed", {
        match_id: input.matchId,
        message_id: row.id as string,
        error: pushError.message
      });
    }
  }).catch((pushError) => {
    void trackEvent("push_send_invoke_failed", {
      match_id: input.matchId,
      message_id: row.id as string,
      error: pushError instanceof Error ? pushError.message : String(pushError)
    });
  });

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
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to mark conversation as read.") };
  }

  return { ok: true as const };
}

export async function hideConversation(matchId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { error } = await (supabase.rpc as any)("hide_conversation", { p_match_id: matchId });
  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to delete conversation.") };
  }

  void trackEvent("conversation_hidden", {
    match_id: matchId
  });

  return { ok: true as const };
}

export async function unmatchConversation(matchId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { error } = await (supabase.rpc as any)("unmatch_conversation", { p_match_id: matchId });
  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to unmatch.") };
  }

  void trackEvent("conversation_unmatched", {
    match_id: matchId
  });

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
    return { ok: false as const, error: toUserFacingError(error?.message, "Failed to submit report.") };
  }

  void trackEvent("report_submitted", {
    category,
    has_message_id: Boolean(input.messageId),
    has_target_profile_id: Boolean(input.targetProfileId),
    has_event_id: Boolean(input.eventId)
  });

  return {
    ok: true as const,
    reportId: data as string
  };
}

export async function listBlockedProfileIds(viewerProfileId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return new Set<string>();
  }

  const { data, error } = await (supabase.from("blocks") as any)
    .select("blocker_profile_id,blocked_profile_id")
    .or(`blocker_profile_id.eq.${viewerProfileId},blocked_profile_id.eq.${viewerProfileId}`);

  if (error || !Array.isArray(data)) {
    return new Set<string>();
  }

  const blocked = new Set<string>();
  for (const row of data as BlockRow[]) {
    if (row.blocker_profile_id === viewerProfileId && row.blocked_profile_id) {
      blocked.add(row.blocked_profile_id);
    }
    if (row.blocked_profile_id === viewerProfileId && row.blocker_profile_id) {
      blocked.add(row.blocker_profile_id);
    }
  }
  return blocked;
}

export async function isProfileBlocked(viewerProfileId: string, otherProfileId: string) {
  const blockedIds = await listBlockedProfileIds(viewerProfileId);
  return blockedIds.has(otherProfileId);
}

export async function blockProfile(viewerProfileId: string, otherProfileId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { error } = await (supabase.from("blocks") as any).insert({
    blocker_profile_id: viewerProfileId,
    blocked_profile_id: otherProfileId
  });

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to block this user.") };
  }

  void trackEvent("profile_blocked", { target_profile_id: otherProfileId });
  return { ok: true as const };
}

export async function unblockProfile(viewerProfileId: string, otherProfileId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { error } = await (supabase.from("blocks") as any)
    .delete()
    .eq("blocker_profile_id", viewerProfileId)
    .eq("blocked_profile_id", otherProfileId);

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to unblock this user.") };
  }

  void trackEvent("profile_unblocked", { target_profile_id: otherProfileId });
  return { ok: true as const };
}
