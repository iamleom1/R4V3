import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../app/AppProvider";
import { theme } from "../../theme";
import type { MessagesStackParamList } from "./MessagesNavigator";
import { createReport, listMessages, markConversationRead, sendMessage, type MessageItem } from "./messagesRepository";

type Props = NativeStackScreenProps<MessagesStackParamList, "Conversation">;

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

export function ConversationScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAppState();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRealSession = Boolean(session?.user?.id);
  const visibleMessages = useMemo(
    () => (hasRealSession ? messages : demoByMatchId[route.params.matchId] ?? []),
    [hasRealSession, messages, route.params.matchId]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setError(null);

      if (!session?.user?.id) {
        if (active) {
          setMessages([]);
          setIsLoading(false);
        }
        return;
      }

      const rows = await listMessages(route.params.matchId, session.user.id);
      if (!active) return;
      setMessages(rows);
      void markConversationRead(route.params.matchId, session.user.id);
      setIsLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [route.params.matchId, session?.user?.id]);

  async function handleSend() {
    const text = draft.trim();
    if (!text) {
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
      setError(result.error);
      return;
    }

    setMessages((prev) => [...prev, result.message]);
    setDraft("");
    void markConversationRead(route.params.matchId, session.user.id);
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
      >
        {hasRealSession ? (
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>{route.params.title}</Text>
              <Text style={styles.headerMeta}>Long-press a message to report it.</Text>
            </View>
            <Pressable style={styles.reportButton} onPress={openProfileReportPrompt}>
              <Text style={styles.reportButtonText}>Report</Text>
            </Pressable>
          </View>
        ) : null}

        {!hasRealSession ? <Text style={styles.hint}>Demo chat mode. Sign in with Supabase to use real messages.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : null}

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
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message your match..."
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

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
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
    gap: 10
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleMd
  },
  headerMeta: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  hint: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  loadingText: {
    color: theme.colors.textSecondary
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
  reportButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,159,159,0.4)",
    backgroundColor: "rgba(76,20,20,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  reportButtonText: {
    color: "#FFD1D1",
    fontWeight: "700",
    fontSize: 12
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
