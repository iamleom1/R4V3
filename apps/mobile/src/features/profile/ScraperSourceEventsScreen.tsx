import React, { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { theme } from "../../theme";
import { listScraperSourceEventsBySource, type ScraperSourceEvent } from "./moderationRepository";
import type { ProfileStackParamList } from "./ProfileNavigator";

type Props = NativeStackScreenProps<ProfileStackParamList, "ScraperSourceEvents">;

export function ScraperSourceEventsScreen({ route }: Props) {
  const { source } = route.params;
  const sourceLabel = source === "posh" ? "POSH" : source === "dice" ? "DICE" : "EDMTrain";
  const [events, setEvents] = useState<ScraperSourceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    const nextEvents = await listScraperSourceEventsBySource(source, 40);
    setEvents(nextEvents);
    setIsLoading(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, [source]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} tintColor={theme.colors.accent} progressBackgroundColor="#1A1712" />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{sourceLabel} Events</Text>
        <Text style={styles.heroMeta}>Upcoming events currently stored from the {sourceLabel} scraper.</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading {sourceLabel} events...</Text>
        </View>
      ) : null}

      {!isLoading && events.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No upcoming {sourceLabel} events are currently stored.</Text>
        </View>
      ) : null}

      {events.map((event) => (
        <View key={event.id} style={styles.card}>
          <Text style={styles.cardTitle}>{event.title}</Text>
          <Text style={styles.cardMeta}>{[event.venueName, event.city].filter(Boolean).join(" • ") || "Venue pending"}</Text>
          <Text style={styles.cardMeta}>{formatTimestamp(event.startsAt)}</Text>
          {event.genreTags.length > 0 ? <Text style={styles.cardTags}>{event.genreTags.slice(0, 4).join(" • ")}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.canvas },
  container: { padding: 16, gap: 12 },
  hero: { gap: 4 },
  heroTitle: { color: theme.colors.textPrimary, ...theme.type.titleLg },
  heroMeta: { color: theme.colors.textSecondary, ...theme.type.caption },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { color: theme.colors.textSecondary },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 6
  },
  cardTitle: { color: theme.colors.textPrimary, ...theme.type.titleSm },
  cardMeta: { color: theme.colors.textSecondary, ...theme.type.caption },
  cardTags: { color: theme.colors.textPrimary, fontWeight: "700" },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14
  },
  emptyText: { color: theme.colors.textSecondary }
});
