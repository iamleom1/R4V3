import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { getSupabaseClient } from "../../lib/supabase";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";
import type { DiscoverStackParamList } from "./DiscoverNavigator";
import { listEventCrewMessages, sendEventCrewMessage, type EventCrewMessage } from "./eventRepository";

type Props = NativeStackScreenProps<DiscoverStackParamList, "EventCrewRoom">;

export function EventCrewRoomScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAppState();
  const [messages, setMessages] = useState<EventCrewMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRealSession = Boolean(session?.user?.id);
  const visibleMessages = useMemo(
    () => (hasRealSession ? messages : []),
    [hasRealSession, messages]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const rows = await listEventCrewMessages(route.params.roomId);
        if (active) {
          setMessages(rows);
        }
      } catch (e) {
        if (active) {
          setError(toUserFacingError(e, "Failed to load crew group."));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [route.params.roomId]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`event-room:${route.params.roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "event_room_messages",
          filter: `room_id=eq.${route.params.roomId}`
        },
        (payload: any) => {
          const nextMessage: EventCrewMessage = {
            id: payload.new.id,
            roomId: payload.new.room_id,
            senderProfileId: payload.new.sender_profile_id,
            body: payload.new.body,
            createdAt: payload.new.created_at
          };
          setMessages((prev) => appendUniqueRoomMessage(prev, nextMessage));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [route.params.roomId, session?.user?.id]);

  async function handleSend() {
    if (!session?.user?.id) {
      return;
    }

    setIsSending(true);
    setError(null);
    const result = await sendEventCrewMessage({
      roomId: route.params.roomId,
      senderProfileId: session.user.id,
      body: draft
    });
    setIsSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessages((prev) => appendUniqueRoomMessage(prev, result.message));
    setDraft("");
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 86 : 0}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.container, { paddingBottom: 12 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <Text style={styles.headerEyebrow}>Crew Group</Text>
          <Text style={styles.headerTitle}>{route.params.roomTitle}</Text>
          <Text style={styles.headerMeta}>{route.params.eventTitle}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

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

function appendUniqueRoomMessage(messages: EventCrewMessage[], nextMessage: EventCrewMessage) {
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
  container: { padding: 16, gap: 10 },
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
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { color: theme.colors.textSecondary },
  thread: { gap: 10 },
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
  sendButtonText: { color: "#FFF8EE", fontWeight: "700" }
});
