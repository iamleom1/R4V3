import React, { useEffect, useMemo, useState } from "react";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../app/AppProvider";
import { RemoteImage } from "../../components/RemoteImage";
import { getSupabaseClient } from "../../lib/supabase";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";
import type { MessagesStackParamList } from "./MessagesNavigator";
import {
  addCrewGroupMembers,
  leaveCrewGroup,
  listCrewGroupMembers,
  listCrewGroupMessages,
  listGroupChatCandidates,
  sendCrewGroupMessage,
  type CrewGroupMember,
  type CrewGroupMessage,
  type GroupChatCandidate
} from "./messagesRepository";

type Props = NativeStackScreenProps<MessagesStackParamList, "GroupChat">;

export function GroupChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { session } = useAppState();
  const [messages, setMessages] = useState<CrewGroupMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<CrewGroupMember[]>([]);
  const [isManageMembersOpen, setIsManageMembersOpen] = useState(false);
  const [candidatePool, setCandidatePool] = useState<GroupChatCandidate[]>([]);
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [isSavingMembers, setIsSavingMembers] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);

  const hasRealSession = Boolean(session?.user?.id);
  const composerBottomInset = useMemo(() => {
    const safeAreaBottom = Math.max(insets.bottom, 8);
    return safeAreaBottom + tabBarHeight + 12;
  }, [insets.bottom, tabBarHeight]);
  const visibleMessages = useMemo(() => (hasRealSession ? messages : []), [hasRealSession, messages]);
  const inviteCandidates = useMemo(
    () => candidatePool.filter((candidate) => !members.some((member) => member.profileId === candidate.profileId)),
    [candidatePool, members]
  );

  async function loadMessages(options?: { refresh?: boolean }) {
    const isRefresh = Boolean(options?.refresh);
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const rows = await listCrewGroupMessages(route.params.groupId);
      setMessages(rows);
    } catch (e) {
      setError(toUserFacingError(e, "Failed to load crew chat."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [route.params.groupId]);

  useEffect(() => {
    if (!session?.user?.id) {
      setMembers([]);
      return;
    }

    void loadMembers();
  }, [route.params.groupId, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`crew-group:${route.params.groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crew_group_messages",
          filter: `group_id=eq.${route.params.groupId}`
        },
        (payload: any) => {
          const nextMessage: CrewGroupMessage = {
            id: payload.new.id,
            groupId: payload.new.group_id,
            senderProfileId: payload.new.sender_profile_id,
            body: payload.new.body,
            createdAt: payload.new.created_at
          };
          setMessages((prev) => appendUniqueGroupMessage(prev, nextMessage));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [route.params.groupId, session?.user?.id]);

  async function handleSend() {
    if (!session?.user?.id) {
      return;
    }

    setIsSending(true);
    setError(null);
    const result = await sendCrewGroupMessage({
      groupId: route.params.groupId,
      senderProfileId: session.user.id,
      body: draft
    });
    setIsSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessages((prev) => appendUniqueGroupMessage(prev, result.message));
    setDraft("");
  }

  async function loadMembers() {
    try {
      const rows = await listCrewGroupMembers(route.params.groupId);
      setMembers(rows);
    } catch {
      setMembers([]);
    }
  }

  async function openManageMembers() {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "Sign in to manage this crew.");
      return;
    }

    try {
      const [candidateRows, memberRows] = await Promise.all([
        listGroupChatCandidates(session.user.id),
        listCrewGroupMembers(route.params.groupId)
      ]);
      setCandidatePool(candidateRows);
      setMembers(memberRows);
      setSelectedInviteIds([]);
      setIsManageMembersOpen(true);
    } catch (e) {
      Alert.alert("Crew unavailable", toUserFacingError(e, "Failed to load crew members."));
    }
  }

  function toggleInvite(profileId: string) {
    setSelectedInviteIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  }

  async function handleAddMembers() {
    if (selectedInviteIds.length === 0) {
      Alert.alert("Select matches", "Pick at least one matched user to add.");
      return;
    }

    setIsSavingMembers(true);
    const result = await addCrewGroupMembers({
      groupId: route.params.groupId,
      memberIds: selectedInviteIds
    });
    setIsSavingMembers(false);

    if (!result.ok) {
      Alert.alert("Add failed", result.error);
      return;
    }

    if (result.addedCount < 1) {
      Alert.alert("No one added", "Only matched users who are not already in the crew can be added.");
      return;
    }

    await loadMembers();
    setSelectedInviteIds([]);
    setIsManageMembersOpen(false);
  }

  function confirmLeaveCrewGroup() {
    Alert.alert("Delete crew chat?", "This removes the crew chat from your list. Other members will keep it.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void handleLeaveCrewGroup() }
    ]);
  }

  async function handleLeaveCrewGroup() {
    setIsLeavingGroup(true);
    const result = await leaveCrewGroup(route.params.groupId);
    setIsLeavingGroup(false);

    if (!result.ok) {
      Alert.alert("Delete failed", result.error);
      return;
    }

    navigation.goBack();
  }

  return (
    <>
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 86 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingBottom: 12 }]}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical
        bounces
        overScrollMode="always"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadMessages({ refresh: true });
            }}
            tintColor={theme.colors.accent}
            progressBackgroundColor="#1A1712"
            progressViewOffset={12}
          />
        }
      >
        <View style={styles.headerCard}>
          <Text style={styles.headerEyebrow}>Crew Chat</Text>
          <Text style={styles.headerTitle}>{route.params.title}</Text>
          <Text style={styles.headerMeta}>Start bringing more people into the plan from here.</Text>
          <View style={styles.headerActionRow}>
            <Pressable style={styles.headerActionButton} onPress={() => void openManageMembers()}>
              <Text style={styles.headerActionButtonText}>Add matched users</Text>
            </Pressable>
            <Pressable style={styles.headerActionButton} onPress={confirmLeaveCrewGroup} disabled={isLeavingGroup}>
              <Text style={styles.headerActionButtonText}>{isLeavingGroup ? "Deleting..." : "Delete crew chat"}</Text>
            </Pressable>
          </View>
          {members.length > 0 ? (
            <View style={styles.memberChipRow}>
              {members.map((member) => (
                <View key={member.profileId} style={styles.memberChip}>
                  <Text style={styles.memberChipText} numberOfLines={1}>{member.displayName}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Crew chat issue</Text>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadMessages({ refresh: true })}>
              <Text style={styles.retryButtonText}>Reload crew chat</Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading crew chat...</Text>
          </View>
        ) : null}

        <View style={styles.thread}>
          {visibleMessages.map((message) => {
            const mine = message.senderProfileId === (session?.user?.id ?? "me");
            return (
              <View key={message.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.body}</Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatTime(message.createdAt)}</Text>
                </View>
              </View>
            );
          })}
          {!isLoading && visibleMessages.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>No messages yet.</Text>
              <Text style={styles.emptyStateBody}>This crew is ready. Start the plan here or pull down to refresh.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: composerBottomInset }]}>
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message the crew..."
            placeholderTextColor={theme.colors.textSecondary}
            style={styles.input}
            multiline
          />
          <Pressable onPress={() => void handleSend()} disabled={isSending || !draft.trim()} style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}>
            <Text style={styles.sendButtonText}>{isSending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
    <Modal
      visible={isManageMembersOpen}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isSavingMembers) {
          setIsManageMembersOpen(false);
        }
      }}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Matched Users</Text>
            <Pressable style={styles.modalCloseButton} onPress={() => setIsManageMembersOpen(false)} disabled={isSavingMembers}>
              <Text style={styles.modalCloseButtonText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.modalBodyText}>Invite people you already matched with into this crew chat.</Text>
          <ScrollView style={styles.modalMemberList} contentContainerStyle={styles.modalMemberListContent}>
            {inviteCandidates.length > 0 ? (
              inviteCandidates.map((candidate) => {
                const selected = selectedInviteIds.includes(candidate.profileId);
                return (
                  <Pressable
                    key={candidate.profileId}
                    style={[styles.inviteRow, selected && styles.inviteRowSelected]}
                    onPress={() => toggleInvite(candidate.profileId)}
                    disabled={isSavingMembers}
                  >
                    <View style={styles.inviteAvatar}>
                      {candidate.photoUrl ? (
                        <RemoteImage uri={candidate.photoUrl} style={styles.inviteAvatarPhoto} />
                      ) : (
                        <Text style={styles.inviteAvatarText}>{initials(candidate.displayName)}</Text>
                      )}
                    </View>
                    <View style={styles.inviteBody}>
                      <Text style={styles.inviteName}>{candidate.displayName}</Text>
                      <Text style={styles.inviteMeta}>{candidate.city ?? "Matched user"}</Text>
                    </View>
                    <View style={[styles.inviteCheck, selected && styles.inviteCheckSelected]}>
                      <Text style={styles.inviteCheckText}>{selected ? "✓" : "+"}</Text>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.modalEmptyText}>No additional matched users are available to add.</Text>
            )}
          </ScrollView>
          <Pressable
            style={[styles.modalPrimaryButton, (selectedInviteIds.length === 0 || isSavingMembers) && styles.modalPrimaryButtonDisabled]}
            onPress={() => void handleAddMembers()}
            disabled={selectedInviteIds.length === 0 || isSavingMembers}
          >
            <Text style={styles.modalPrimaryButtonText}>{isSavingMembers ? "Adding..." : "Add to Crew"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}

function appendUniqueGroupMessage(messages: CrewGroupMessage[], nextMessage: CrewGroupMessage) {
  const existing = messages.find((message) => message.id === nextMessage.id);
  if (existing) {
    return messages;
  }
  return [...messages, nextMessage].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "R"
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.canvas },
  scroll: { flex: 1, backgroundColor: theme.colors.canvas },
  container: { padding: 16, gap: 10, flexGrow: 1 },
  headerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 4
  },
  headerEyebrow: { color: theme.colors.textSecondary, ...theme.type.caption },
  headerTitle: { color: theme.colors.textPrimary, ...theme.type.titleMd },
  headerMeta: { color: theme.colors.textSecondary, ...theme.type.caption },
  headerActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6
  },
  headerActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  headerActionButtonText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700"
  },
  memberChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  memberChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: "100%"
  },
  memberChipText: {
    color: "rgba(255,248,238,0.78)",
    fontSize: 12,
    fontWeight: "700"
  },
  error: { color: "#FFD1D1", fontWeight: "600" },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,159,159,0.3)",
    backgroundColor: "rgba(90,24,24,0.28)",
    padding: 12,
    gap: 8
  },
  errorTitle: {
    color: "#FFF1F1",
    fontWeight: "800"
  },
  retryButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  retryButtonText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800"
  },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { color: theme.colors.textSecondary },
  thread: { gap: 10, flexGrow: 1 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowOther: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 1
  },
  bubbleMine: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  bubbleOther: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  bubbleText: { color: theme.colors.textPrimary, lineHeight: 18 },
  bubbleTextMine: { color: "#FFF8EE" },
  bubbleTime: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 6, alignSelf: "flex-end" },
  bubbleTimeMine: { color: "rgba(255,248,238,0.78)" },
  emptyStateCard: {
    flex: 1,
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.025)",
    paddingHorizontal: 18,
    gap: 8
  },
  emptyStateTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  emptyStateBody: {
    color: "rgba(235,227,214,0.56)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center"
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: theme.colors.canvas,
    paddingHorizontal: 12,
    paddingTop: 8
  },
  composer: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  input: { flex: 1, color: theme.colors.textPrimary, paddingHorizontal: 8, paddingVertical: 8, maxHeight: 110 },
  sendButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  sendButtonDisabled: { opacity: 0.55 },
  sendButtonText: { color: "#FFF8EE", fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    justifyContent: "center",
    padding: 18
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#11100D",
    padding: 16,
    gap: 12,
    maxHeight: "82%"
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  modalTitle: {
    color: "#FFF8EE",
    fontSize: 20,
    fontWeight: "800"
  },
  modalCloseButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  modalCloseButtonText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700"
  },
  modalBodyText: {
    color: "rgba(235,227,214,0.58)",
    fontSize: 13,
    lineHeight: 18
  },
  modalMemberList: {
    maxHeight: 320
  },
  modalMemberListContent: {
    gap: 8
  },
  inviteRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  inviteRowSelected: {
    borderColor: "rgba(255,154,84,0.28)",
    backgroundColor: "rgba(255,154,84,0.09)"
  },
  inviteAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#1A1712",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  inviteAvatarPhoto: {
    ...StyleSheet.absoluteFillObject
  },
  inviteAvatarText: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  inviteBody: {
    flex: 1,
    gap: 2
  },
  inviteName: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "700"
  },
  inviteMeta: {
    color: "rgba(235,227,214,0.50)",
    fontSize: 12
  },
  inviteCheck: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  inviteCheckSelected: {
    borderColor: "rgba(255,154,84,0.30)",
    backgroundColor: "rgba(255,154,84,0.14)"
  },
  inviteCheckText: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  modalEmptyText: {
    color: "rgba(235,227,214,0.46)",
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 8
  },
  modalPrimaryButton: {
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.5
  },
  modalPrimaryButtonText: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  }
});
