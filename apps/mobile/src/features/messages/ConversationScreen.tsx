import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import {
  ActivityIndicator,
  AppState,
  Alert,
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
import {
  blockProfile,
  createReport,
  ensureDirectCrewGroup,
  isProfileBlocked,
  listMessages,
  markConversationRead,
  sendMessage,
  type MessageItem,
  unblockProfile,
  unmatchConversation
} from "./messagesRepository";

type Props = NativeStackScreenProps<MessagesStackParamList, "Conversation">;

type MeetupQuickAction = {
  label: string;
  message: string;
};

const demoByMatchId: Record<string, MessageItem[]> = {
  "demo-match-1": [
    {
      id: "d1",
      matchId: "demo-match-1",
      senderProfileId: "demo-1",
      body: "Hey! Are you going early for the opener?",
      createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString()
    },
    {
      id: "d2",
      matchId: "demo-match-1",
      senderProfileId: "me",
      body: "Yeah, aiming for 10:30. Want to link by the south entrance?",
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
    }
  ]
};

const meetupQuickActions: MeetupQuickAction[] = [
  { label: "On my way now", message: "On my way now" },
  { label: "Here — where you at?", message: "Here — where you at?" },
  { label: "Main entrance?", message: "Main entrance?" },
  { label: "Down to form a crew?", message: "Down to form a crew?" },
  { label: "You going with anyone else?", message: "You going with anyone else?" },
  { label: "What kind of vibe you on?", message: "What kind of vibe you on?" }
];

export function ConversationScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { session } = useAppState();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isCreatingCrew, setIsCreatingCrew] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [arePromptsHidden, setArePromptsHidden] = useState(true);
  const threadScrollRef = useRef<ScrollView | null>(null);

  const hasRealSession = Boolean(session?.user?.id);
  const composerBottomInset = useMemo(() => {
    const safeAreaBottom = Math.max(insets.bottom, 8);
    return safeAreaBottom + tabBarHeight + 12;
  }, [insets.bottom, tabBarHeight]);
  const visibleMessages = useMemo(
    () => (hasRealSession ? messages : demoByMatchId[route.params.matchId] ?? []),
    [hasRealSession, messages, route.params.matchId]
  );

  function scrollToLatest(animated = true) {
    requestAnimationFrame(() => {
      threadScrollRef.current?.scrollToEnd({ animated });
    });
  }

  async function loadMessages(options?: { refresh?: boolean; silent?: boolean }) {
    const isRefresh = Boolean(options?.refresh);
    const isSilent = Boolean(options?.silent);
    if (isRefresh) {
      if (!isSilent) {
        setIsRefreshing(true);
      }
    } else {
      setIsLoading(true);
    }
    if (!isSilent) {
      setError(null);
    }

    if (!session?.user?.id) {
      setMessages([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      const rows = await listMessages(route.params.matchId, session.user.id);
      setMessages(rows);
      void markConversationRead(route.params.matchId, session.user.id);
    } catch (e) {
      if (!isSilent) {
        setError(toUserFacingError(e, "Failed to load messages."));
      }
    } finally {
      setIsLoading(false);
      if (!isSilent) {
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    async function load() {
      await loadMessages();
    }

    void load().catch(() => undefined);
  }, [route.params.matchId, session?.user?.id]);

  useEffect(() => {
    if (visibleMessages.length === 0) {
      return;
    }
    scrollToLatest(false);
  }, [route.params.matchId]);

  useEffect(() => {
    if (visibleMessages.length === 0) {
      return;
    }
    scrollToLatest(false);
  }, [visibleMessages.length]);

  useEffect(() => {
    let active = true;

    async function loadBlockState() {
      if (!session?.user?.id) {
        if (active) {
          setIsBlocked(false);
        }
        return;
      }

      const blocked = await isProfileBlocked(session.user.id, route.params.otherProfileId);
      if (active) {
        setIsBlocked(blocked);
      }
    }

    void loadBlockState();
    return () => {
      active = false;
    };
  }, [route.params.otherProfileId, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`conversation:${route.params.matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${route.params.matchId}`
        },
        (payload: any) => {
          const nextMessage: MessageItem = {
            id: payload.new.id,
            matchId: payload.new.match_id,
            senderProfileId: payload.new.sender_profile_id,
            body: payload.new.body,
            createdAt: payload.new.created_at
          };

          setMessages((prev) => appendUniqueMessage(prev, nextMessage));
          if (nextMessage.senderProfileId !== session.user.id) {
            void markConversationRead(route.params.matchId, session.user.id);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [route.params.matchId, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    let appState = AppState.currentState;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId) {
        return;
      }
      intervalId = setInterval(() => {
        if (appState !== "active" || isSending) {
          return;
        }
        void loadMessages({ refresh: true, silent: true });
      }, 2500);
    };

    const stopPolling = () => {
      if (!intervalId) {
        return;
      }
      clearInterval(intervalId);
      intervalId = null;
    };

    startPolling();
    const subscription = AppState.addEventListener("change", (nextState) => {
      appState = nextState;
      if (nextState === "active") {
        void loadMessages({ refresh: true, silent: true });
        startPolling();
        return;
      }
      stopPolling();
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [isSending, route.params.matchId, session?.user?.id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        hasRealSession ? (
          <Pressable style={styles.menuButton} onPress={openSafetyPrompt} hitSlop={10}>
            <Text style={styles.menuButtonText}>•••</Text>
          </Pressable>
        ) : null
    });
  }, [hasRealSession, navigation, isBlocked]);

  async function handleSend() {
    const text = draft.trim();
    if (!text) {
      return;
    }
    if (isBlocked) {
      return;
    }

    if (!session?.user?.id) {
      const demoMessage: MessageItem = {
        id: `demo-${Date.now()}`,
        matchId: route.params.matchId,
        senderProfileId: "me",
        body: text,
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, demoMessage]);
      setDraft("");
      return;
    }

    setIsSending(true);
    setError(null);
    const result = await sendMessage({
      matchId: route.params.matchId,
      senderProfileId: session.user.id,
      body: text
    });
    setIsSending(false);

    if (!result.ok) {
      setError(toUserFacingError(result.error, "Failed to send message."));
      return;
    }

    setMessages((prev) => appendUniqueMessage(prev, result.message));
    setDraft("");
    void markConversationRead(route.params.matchId, session.user.id);
  }

  async function handleAddToCrew() {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "Sign in to start a crew chat.");
      return;
    }

    setIsCreatingCrew(true);
    const result = await ensureDirectCrewGroup(route.params.otherProfileId);
    setIsCreatingCrew(false);

    if (!result.ok) {
      Alert.alert("Crew unavailable", result.error);
      return;
    }

    navigation.navigate("GroupChat", {
      groupId: result.group.id,
      title: `${route.params.title} + Crew`
    });
  }

  function queueMeetupPrompt(prompt: string) {
    setDraft((prev) => {
      const next = prev.trim();
      if (!next) {
        return prompt;
      }
      if (next.includes(prompt)) {
        return prev;
      }
      return `${prev.trimEnd()}\n${prompt}`;
    });
  }

  function openProfileReportPrompt() {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "Sign in to submit reports.");
      return;
    }

    Alert.alert("Report profile", "Choose the reason that best fits this report.", [
      { text: "Cancel", style: "cancel" },
      { text: "Spam", onPress: () => void submitReport({ category: "spam", targetProfileId: route.params.otherProfileId }) },
      { text: "Harassment", onPress: () => void submitReport({ category: "harassment", targetProfileId: route.params.otherProfileId }) },
      { text: "Safety", style: "destructive", onPress: () => void submitReport({ category: "minor_safety", targetProfileId: route.params.otherProfileId }) }
    ]);
  }

  function openSafetyPrompt() {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "Sign in to manage safety tools.");
      return;
    }

    Alert.alert("Conversation options", "Choose an action for this chat.", [
      { text: "Cancel", style: "cancel" },
      { text: "Report profile", onPress: openProfileReportPrompt },
      { text: "Unmatch", style: "destructive", onPress: () => void confirmUnmatchConversation() },
      { text: "Block user", style: "destructive", onPress: () => void confirmBlockProfile() }
    ]);
  }

  function openMessageReportPrompt(message: MessageItem) {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "Sign in to submit reports.");
      return;
    }

    Alert.alert("Report message", "This will flag the selected message for review.", [
      { text: "Cancel", style: "cancel" },
      { text: "Spam", onPress: () => void submitReport({ category: "spam", messageId: message.id, targetProfileId: route.params.otherProfileId }) },
      { text: "Harassment", onPress: () => void submitReport({ category: "harassment", messageId: message.id, targetProfileId: route.params.otherProfileId }) },
      { text: "Threat", style: "destructive", onPress: () => void submitReport({ category: "threat", messageId: message.id, targetProfileId: route.params.otherProfileId }) }
    ]);
  }

  async function submitReport(input: { category: string; targetProfileId?: string; messageId?: string }) {
    setError(null);
    const result = await createReport({
      category: input.category,
      targetProfileId: input.targetProfileId,
      messageId: input.messageId
    });

    if (!result.ok) {
      Alert.alert("Report failed", result.error);
      return;
    }

    Alert.alert("Report submitted", "Thanks. Your report has been added to the moderation queue.");
  }

  function confirmBlockProfile() {
    Alert.alert(
      "Block user?",
      "You won’t see each other in chat or crew discovery, and future messages in this thread will be blocked.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => void handleBlockProfile() }
      ]
    );
  }

  function confirmUnmatchConversation() {
    Alert.alert(
      "Unmatch user?",
      "This removes the match and deletes this direct conversation for both of you. This does not block them.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unmatch", style: "destructive", onPress: () => void handleUnmatchConversation() }
      ]
    );
  }

  async function handleUnmatchConversation() {
    const result = await unmatchConversation(route.params.matchId);
    if (!result.ok) {
      Alert.alert("Unmatch failed", result.error);
      return;
    }

    Alert.alert("Unmatched", "This conversation has been removed.", [
      {
        text: "OK",
        onPress: () => {
          navigation.goBack();
        }
      }
    ]);
  }

  async function handleBlockProfile() {
    if (!session?.user?.id) {
      return;
    }

    const result = await blockProfile(session.user.id, route.params.otherProfileId);
    if (!result.ok) {
      Alert.alert("Block failed", result.error);
      return;
    }

    setIsBlocked(true);
    Alert.alert("User blocked", "This conversation will be removed from your chat list.", [
      {
        text: "OK",
        onPress: () => {
          navigation.goBack();
        }
      }
    ]);
  }

  async function handleUnblockProfile() {
    if (!session?.user?.id) {
      return;
    }

    const result = await unblockProfile(session.user.id, route.params.otherProfileId);
    if (!result.ok) {
      Alert.alert("Unblock failed", result.error);
      return;
    }

    setIsBlocked(false);
    Alert.alert("User unblocked", "You can message this user again.");
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 86 : 0}
    >
      <ScrollView
        ref={threadScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical
        bounces
        overScrollMode="always"
        onContentSizeChange={() => scrollToLatest(false)}
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
        {hasRealSession ? (
          <View style={styles.headerBlock}>
            <Pressable
              style={[styles.addToCrewButton, (isBlocked || isCreatingCrew) && styles.addToCrewButtonDisabled]}
              onPress={() => void handleAddToCrew()}
              disabled={isBlocked || isCreatingCrew}
            >
              <Text style={styles.addToCrewButtonText}>{isCreatingCrew ? "Opening crew..." : "+ Create Crew"}</Text>
            </Pressable>
          </View>
        ) : null}

        {!hasRealSession ? <Text style={styles.hint}>Demo chat mode. Sign in with Supabase to use real messages.</Text> : null}
        {hasRealSession && isBlocked ? <Text style={styles.hint}>Messaging is disabled while this user is blocked.</Text> : null}
        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Message issue</Text>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => navigation.replace("Conversation", route.params)}>
              <Text style={styles.retryButtonText}>Reload thread</Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : null}

        <View style={styles.threadFrame}>
          <View style={styles.thread}>
            {visibleMessages.map((message) => {
              const mine = message.senderProfileId === (session?.user?.id ?? "me");
              return (
                <View key={message.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    <Pressable disabled={mine} onLongPress={() => openMessageReportPrompt(message)}>
                      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.body}</Text>
                      <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatTime(message.createdAt)}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View
        style={[styles.composerWrap, { paddingBottom: composerBottomInset }]}
      >
        {!isBlocked ? (
          <View style={styles.meetupPanel}>
            <View style={styles.meetupPanelHeader}>
              <Text style={styles.meetupPanelTitle}>Quick prompts</Text>
              <View style={styles.meetupPanelHeaderActions}>
                <Text style={styles.meetupPanelMeta}>Optional</Text>
                <Pressable
                  onPress={() => setArePromptsHidden((prev) => !prev)}
                  style={styles.meetupToggleButton}
                  hitSlop={8}
                >
                  <Text style={styles.meetupToggleButtonText}>{arePromptsHidden ? "Show" : "Hide"}</Text>
                </Pressable>
              </View>
            </View>
            {!arePromptsHidden ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meetupPromptRow}>
                {meetupQuickActions.map((action) => (
                  <Pressable key={action.label} onPress={() => queueMeetupPrompt(action.message)} style={styles.meetupPromptChip}>
                    <Text style={styles.meetupPromptChipText}>{action.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={isBlocked ? "Unblock this user to message again" : "Message your match..."}
            placeholderTextColor={theme.colors.textSecondary}
            style={styles.input}
            multiline
            editable={!isBlocked}
          />
          <Pressable onPress={() => void handleSend()} disabled={isBlocked || isSending || !draft.trim()} style={[styles.sendButton, (isBlocked || !draft.trim() || isSending) && styles.sendButtonDisabled]}>
            <Text style={styles.sendButtonText}>{isSending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

function appendUniqueMessage(messages: MessageItem[], nextMessage: MessageItem) {
  const existing = messages.find((message) => message.id === nextMessage.id);
  if (existing) {
    return messages;
  }

  return [...messages, nextMessage].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  },
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  },
  container: {
    padding: 16,
    gap: 6,
    flexGrow: 1
  },
  headerBlock: {
    gap: 4
  },
  hint: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  addToCrewButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.025)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  addToCrewButtonDisabled: {
    opacity: 0.55
  },
  addToCrewButtonText: {
    color: "rgba(255,248,238,0.68)",
    fontSize: 11,
    fontWeight: "700"
  },
  error: {
    color: "#FFD1D1",
    fontWeight: "600"
  },
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
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  loadingText: {
    color: theme.colors.textSecondary
  },
  threadFrame: {
    flexGrow: 1,
    justifyContent: "flex-end"
  },
  thread: {
    gap: 10
  },
  bubbleRow: {
    flexDirection: "row"
  },
  bubbleRowMine: {
    justifyContent: "flex-end"
  },
  bubbleRowOther: {
    justifyContent: "flex-start"
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 1
  },
  bubbleMine: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent
  },
  bubbleOther: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border
  },
  bubbleText: {
    color: theme.colors.textPrimary,
    lineHeight: 18
  },
  bubbleTextMine: {
    color: "#FFF8EE"
  },
  bubbleTime: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    marginTop: 6,
    alignSelf: "flex-end"
  },
  bubbleTimeMine: {
    color: "rgba(255,248,238,0.78)"
  },
  menuButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    minWidth: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  menuButtonText: {
    color: "#FFF8EE",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 1
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: theme.colors.canvas,
    paddingHorizontal: 12,
    paddingTop: 8
  },
  meetupPanel: {
    gap: 8,
    marginBottom: 10
  },
  meetupPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  meetupPanelHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  meetupPanelTitle: {
    color: "rgba(255,248,238,0.72)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2
  },
  meetupPanelMeta: {
    color: "rgba(255,248,238,0.36)",
    fontSize: 11,
    fontWeight: "600"
  },
  meetupToggleButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  meetupToggleButtonText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700"
  },
  meetupPromptRow: {
    gap: 8,
    paddingRight: 12
  },
  meetupPromptChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  meetupPromptChipText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700"
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
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 110
  },
  sendButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  sendButtonDisabled: {
    opacity: 0.55
  },
  sendButtonText: {
    color: "#FFF8EE",
    fontWeight: "700"
  }
});
