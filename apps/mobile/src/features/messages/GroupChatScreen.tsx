import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { getSupabaseClient } from "../../lib/supabase";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";
import type { MessagesStackParamList } from "./MessagesNavigator";
import { listCrewGroupMessages, sendCrewGroupMessage, type CrewGroupMessage } from "./messagesRepository";

type Props = NativeStackScreenProps<MessagesStackParamList, "GroupChat">;

export function GroupChatScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAppState();
  const [messages, setMessages] = useState<CrewGroupMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRealSession = Boolean(session?.user?.id);
  const visibleMessages = useMemo(() => (hasRealSession ? messages : []), [hasRealSession, messages]);

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

  return (
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

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
    backgroundColor: "#11100D",
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
  sendButtonText: { color: "#FFF8EE", fontWeight: "800" }
});
