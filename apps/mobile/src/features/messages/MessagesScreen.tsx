import React, { useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAppState } from "../../app/AppProvider";
import { theme } from "../../theme";
import type { MessagesStackParamList } from "./MessagesNavigator";
import { listConversations, type ConversationListItem } from "./messagesRepository";

type Props = NativeStackScreenProps<MessagesStackParamList, "MessagesHome">;

type CrewRoomItem = {
  id: string;
  eventName: string;
  crewSize: number;
  active: boolean;
  latestAt: string;
  lookingCount: number;
  representativeConversation: ConversationListItem;
};

const demoConversations: ConversationListItem[] = [
  {
    matchId: "demo-match-1",
    mode: "community",
    eventName: "Warehouse Pulse",
    otherProfileId: "demo-1",
    otherDisplayName: "Neon Ally",
    otherCity: "Los Angeles",
    otherVibeTags: ["House", "Festival Crew"],
    matchedAt: new Date().toISOString(),
    lastMessageBody: "I’m heading in around 10:30. Want to meet near the south entrance?",
    lastMessageAt: new Date().toISOString(),
    lastMessageSenderProfileId: "demo-1",
    lastReadAt: null,
    isUnread: true
  },
  {
    matchId: "demo-match-2",
    mode: "community",
    eventName: "Afterhours Signal",
    otherProfileId: "demo-2",
    otherDisplayName: "Melodic Motion",
    otherCity: "San Francisco",
    otherVibeTags: ["Melodic Techno", "Techno"],
    matchedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    lastMessageBody: "Down for a small group meetup before the opener.",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    lastMessageSenderProfileId: "demo-2",
    lastReadAt: null,
    isUnread: true
  }
];

export function MessagesScreen({ navigation }: Props) {
  const { session } = useAppState();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRealSession = Boolean(session?.user?.id);
  const visibleItems = useMemo(
    () => (hasRealSession && items.length > 0 ? items : !hasRealSession ? demoConversations : items),
    [hasRealSession, items]
  );
  const unreadCount = useMemo(() => {
    const viewerId = session?.user?.id ?? "me";
    return visibleItems.filter((item) => item.isUnread && item.lastMessageSenderProfileId !== viewerId).length;
  }, [visibleItems, session?.user?.id]);
  const matchBubbleItems = useMemo(() => visibleItems.slice(0, 8), [visibleItems]);
  const hasConversations = visibleItems.length > 0;
  const crewRooms = useMemo<CrewRoomItem[]>(() => {
    const byEvent = new Map<string, ConversationListItem[]>();
    for (const item of visibleItems) {
      if (!item.eventName?.trim()) continue;
      const key = item.eventName.trim();
      const existing = byEvent.get(key) ?? [];
      existing.push(item);
      byEvent.set(key, existing);
    }
    return Array.from(byEvent.entries())
      .map(([eventName, rows], idx) => {
        const latest = rows
          .map((row) => row.lastMessageAt ?? row.matchedAt)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? new Date().toISOString();
        const active = Date.now() - new Date(latest).getTime() < 1000 * 60 * 60 * 12;
        return {
          id: `crew-room-${eventName}-${idx}`,
          eventName,
          crewSize: Math.max(2, Math.min(8, rows.length + 1)),
          active,
          latestAt: latest,
          lookingCount: Math.max(1, rows.length),
          representativeConversation: rows[0]
        };
      })
      .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
  }, [visibleItems]);

  function openConversation(item: ConversationListItem) {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "Sign in to join this crew chat.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign in",
          onPress: () => {
            const rootNav: any = navigation.getParent()?.getParent();
            rootNav?.navigate?.("Auth");
          }
        }
      ]);
      return;
    }
    setItems((prev) =>
      prev.map((row) => (row.matchId === item.matchId ? { ...row, isUnread: false, lastReadAt: new Date().toISOString() } : row))
    );
    navigation.navigate("Conversation", {
      matchId: item.matchId,
      title: item.otherDisplayName,
      otherProfileId: item.otherProfileId
    });
  }

  async function load(opts?: { refresh?: boolean }) {
    const refresh = opts?.refresh ?? false;
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      if (!session?.user?.id) {
        setItems([]);
        return;
      }
      const rows = await listConversations(session.user.id);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversations.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, [session?.user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      void load({ refresh: true });
      return undefined;
    }, [session?.user?.id])
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingTop: 12 }]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void load({ refresh: true })}
          tintColor={theme.colors.accent}
          progressBackgroundColor="#1A1712"
        />
      }
    >
      <View style={styles.chatHeader}>
        <Text style={styles.chatTitle}>Chat</Text>
        {hasConversations ? (
          <Pressable style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{visibleItems.length} threads</Text>
          </Pressable>
        ) : null}
      </View>

      {!session?.user?.id ? (
        <View style={styles.authNoticeStrip}>
          <Text style={styles.authNoticeText}>Sign in to join this crew chat.</Text>
          <Pressable
            style={styles.authNoticeAction}
            onPress={() => {
              const rootNav: any = navigation.getParent()?.getParent();
              rootNav?.navigate?.("Auth");
            }}
          >
            <Text style={styles.authNoticeActionText}>Sign in</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.matchesSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>New Connections</Text>
          <Text style={styles.newMatchesMeta}>{unreadCount} unread</Text>
        </View>
        {matchBubbleItems.length === 0 ? (
          <View style={styles.matchesBubbleEmptyWide}>
            <Text style={styles.matchesBubbleEmptyTextMuted}>No new matches yet</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.matchesBubbleRow}>
            {matchBubbleItems.map((item, idx) => {
              const viewerId = session?.user?.id ?? "me";
              const unread = item.isUnread && item.lastMessageSenderProfileId !== viewerId;
              return (
                <Pressable
                  key={`bubble-${item.matchId}`}
                  style={styles.matchBubbleItem}
                  onPress={() => openConversation(item)}
                >
                  <View style={[styles.matchBubbleFrame, getAvatarPalette(item, idx)]}>
                    <View style={styles.artGlow} />
                    <Text style={styles.matchBubbleInitials}>{initials(item.otherDisplayName)}</Text>
                    {unread ? <View style={styles.matchBubbleUnreadDot} /> : null}
                  </View>
                  <Text style={styles.matchBubbleName} numberOfLines={1}>{item.otherDisplayName}</Text>
                  <Text style={styles.matchBubbleMeta} numberOfLines={1}>{item.eventName ?? "Crew match"}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.sectionDivider} />

      <View style={styles.matchesSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Event Crew Chats</Text>
          <Text style={styles.newMatchesMeta}>{crewRooms.length} rooms</Text>
        </View>

        {crewRooms.length === 0 ? (
          <View style={styles.systemRow}>
            <Text style={styles.systemRowText}>No active crew chats.</Text>
          </View>
        ) : (
          <View style={styles.crewRoomList}>
            {crewRooms.map((room, idx) => (
              <Pressable
                key={room.id}
                style={[styles.crewRoomCard, idx === 0 && styles.crewRoomCardFirst]}
                onPress={() => openConversation(room.representativeConversation)}
              >
                <View style={[styles.crewRoomArt, getAvatarPalette(room.representativeConversation, idx)]}>
                  <View style={styles.artGlow} />
                  <Text style={styles.crewRoomArtText}>{initials(room.eventName)}</Text>
                </View>
                <View style={styles.crewRoomBody}>
                  <View style={styles.crewRoomTopRow}>
                    <Text style={styles.crewRoomTitle} numberOfLines={1}>{room.eventName}</Text>
                    <View style={[styles.crewRoomStatusPill, room.active && styles.crewRoomStatusPillActive]}>
                      <View style={[styles.crewRoomStatusDot, room.active && styles.crewRoomStatusDotActive]} />
                      <Text style={[styles.crewRoomStatusText, room.active && styles.crewRoomStatusTextActive]}>
                        {room.active ? "Active" : "Quiet"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.crewRoomMetaRow}>
                    <Text style={styles.crewRoomMetaText}>{room.crewSize} in crew</Text>
                    <Text style={styles.crewRoomMetaDot}>•</Text>
                    <Text style={styles.crewRoomMetaText}>{room.lookingCount} looking</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : null}

      <View style={styles.sectionDivider} />

      {hasConversations ? (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Direct Messages</Text>
            <Text style={styles.listHeaderMeta}>{visibleItems.length} chats • {unreadCount} unread</Text>
          </View>

          <View style={styles.list}>
            {visibleItems.map((item, idx) => {
              const viewerId = session?.user?.id ?? "me";
              const unread = item.isUnread && item.lastMessageSenderProfileId !== viewerId;
              return (
                <Pressable
                  key={item.matchId}
                  onPress={() => openConversation(item)}
                  style={[styles.item, idx === 0 && styles.itemFirst, unread && styles.itemUnread]}
                >
                  <View style={[styles.art, getAvatarPalette(item, idx)]}>
                    <View style={styles.artGlow} />
                    <Text style={styles.artText}>{initials(item.otherDisplayName)}</Text>
                    {unread ? <View style={styles.artUnreadDot} /> : null}
                  </View>
                  <View style={styles.itemBody}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemNameRow}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.otherDisplayName}</Text>
                      </View>
                      <Text style={styles.itemTime}>{formatRelative(item.lastMessageAt ?? item.matchedAt)}</Text>
                    </View>
                    <Text style={[styles.itemPreview, unread && styles.itemPreviewUnread]} numberOfLines={1}>
                      {item.lastMessageBody ?? "You matched. Start the conversation."}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {!isLoading && visibleItems.length === 0 ? (
        <View style={styles.emptySystemPanel}>
          <Text style={styles.emptySystemTitle}>Direct Messages</Text>
          <Text style={styles.emptySystemText}>No direct conversations yet.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "R";
}

function formatRelative(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return "";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getAvatarPalette(item: ConversationListItem, index: number) {
  const seed = `${item.otherDisplayName}-${item.eventName ?? ""}-${index}`.toLowerCase();
  if (seed.includes("bass") || seed.includes("dub")) return { backgroundColor: "#241938", borderColor: "#6C49FF" };
  if (seed.includes("techno")) return { backgroundColor: "#2A181B", borderColor: "#FF6A4D" };
  if (seed.includes("house")) return { backgroundColor: "#2A1F14", borderColor: "#FF9A54" };
  return { backgroundColor: "#18202D", borderColor: "#4F86FF" };
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  },
  container: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 12
  },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 16,
    gap: 6
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  heroBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  heroBadgeText: {
    color: "#FFF8EE",
    fontSize: 10,
    fontWeight: "700"
  },
  eyebrow: {
    color: theme.colors.textSecondary,
    ...theme.type.eyebrow,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleLg
  },
  heroBody: {
    color: theme.colors.textSecondary,
    ...theme.type.body
  },
  hint: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 2
  },
  authNoticeStrip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.24)",
    backgroundColor: "rgba(211,92,51,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8
  },
  authNoticeText: {
    color: "#F8F1E4",
    fontSize: 12.5,
    fontWeight: "700",
    flex: 1
  },
  authNoticeAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  authNoticeActionText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800"
  },
  chatTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "800"
  },
  matchesSection: {
    gap: 10
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: 2
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800"
  },
  newMatchesMeta: {
    color: "rgba(235,227,214,0.52)",
    fontSize: 12,
    fontWeight: "600"
  },
  listHeaderMeta: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  matchesBubbleRow: {
    gap: 12,
    paddingRight: 12
  },
  matchBubbleItem: {
    width: 88,
    alignItems: "center",
    gap: 6
  },
  matchBubbleFrame: {
    width: 76,
    height: 76,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  matchBubbleInitials: {
    color: "#FFF8EE",
    fontWeight: "800",
    fontSize: 18
  },
  matchBubbleUnreadDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: "#11100D"
  },
  matchBubbleName: {
    color: "#EDE4D8",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center"
  },
  matchBubbleMeta: {
    color: "rgba(235,227,214,0.46)",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center"
  },
  matchesBubbleEmpty: {
    width: 160,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center"
  },
  matchesBubbleEmptyWide: {
    width: "100%",
    height: 34,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center"
  },
  matchesBubbleEmptyText: {
    color: theme.colors.textSecondary,
    fontSize: 12
  },
  matchesBubbleEmptyTextMuted: {
    color: "rgba(235,227,214,0.30)",
    fontSize: 11,
    fontWeight: "600"
  },
  systemRow: {
    paddingHorizontal: 2,
    paddingVertical: 2
  },
  systemRowText: {
    color: "rgba(235,227,214,0.58)",
    fontSize: 12,
    lineHeight: 18
  },
  crewRoomList: {
    gap: 10
  },
  crewRoomCard: {
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 2,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    overflow: "hidden"
  },
  crewRoomCardFirst: {
    borderTopWidth: 0,
    paddingTop: 2
  },
  crewRoomCardArtBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    opacity: 0.65
  },
  crewRoomBandGlowA: {
    position: "absolute",
    width: 70,
    height: 18,
    borderRadius: 999,
    left: -12,
    top: -6,
    backgroundColor: "rgba(216,119,255,0.9)"
  },
  crewRoomBandGlowB: {
    position: "absolute",
    width: 80,
    height: 16,
    borderRadius: 999,
    right: -10,
    top: -5,
    backgroundColor: "rgba(227,108,63,0.85)"
  },
  crewRoomBandLineA: {
    position: "absolute",
    left: -20,
    right: -20,
    top: 0,
    height: 1,
    backgroundColor: "rgba(216,119,255,0.65)",
    transform: [{ rotate: "-4deg" }]
  },
  crewRoomBandLineB: {
    position: "absolute",
    left: -20,
    right: -20,
    top: 0,
    height: 1,
    backgroundColor: "rgba(255,176,123,0.45)",
    transform: [{ rotate: "5deg" }]
  },
  crewRoomArt: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  crewRoomArtText: {
    color: "#FFF8EE",
    fontWeight: "800",
    fontSize: 14
  },
  crewRoomBody: {
    flex: 1,
    gap: 3
  },
  crewRoomTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  crewRoomTitle: {
    flex: 1,
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  crewRoomStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  crewRoomStatusPillActive: {
    borderColor: "rgba(116,213,151,0.20)",
    backgroundColor: "rgba(116,213,151,0.06)"
  },
  crewRoomStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)"
  },
  crewRoomStatusDotActive: {
    backgroundColor: "#59D08D"
  },
  crewRoomStatusText: {
    color: "rgba(235,227,214,0.54)",
    fontSize: 10,
    fontWeight: "700"
  },
  crewRoomStatusTextActive: {
    color: "#D6F6E4"
  },
  crewRoomMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  crewRoomMetaText: {
    color: "rgba(235,227,214,0.74)",
    fontSize: 12,
    fontWeight: "600"
  },
  crewRoomMetaDot: {
    color: "rgba(235,227,214,0.38)",
    fontSize: 12
  },
  crewRoomSystemNote: {
    color: "rgba(235,227,214,0.46)",
    fontSize: 10.5,
    fontWeight: "500"
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8
  },
  loadingText: {
    color: theme.colors.textSecondary
  },
  list: {
    gap: 0,
    marginTop: -2
  },
  item: {
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    backgroundColor: "transparent",
    paddingHorizontal: 2,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  itemFirst: {
    borderTopWidth: 0
  },
  itemUnread: {
    borderTopColor: "rgba(211,92,51,0.20)",
    backgroundColor: "transparent"
  },
  art: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  artGlow: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)"
  },
  artUnreadDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: "#1A1712"
  },
  artText: {
    color: "#FFF8EE",
    fontWeight: "800",
    fontSize: 18
  },
  itemBody: {
    flex: 1,
    gap: 2
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  itemNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  itemName: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
    flex: 1
  },
  itemTime: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  itemPreview: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    paddingRight: 6
  },
  itemPreviewUnread: {
    color: "#EADFD0"
  },
  empty: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 6
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 16
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    ...theme.type.body
  },
  emptySystemPanel: {
    paddingHorizontal: 2,
    paddingVertical: 4,
    gap: 6
  },
  emptySystemTitle: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "700"
  },
  emptySystemText: {
    color: "rgba(235,227,214,0.58)",
    fontSize: 12,
    lineHeight: 18
  }
});
