import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { theme } from "../../theme";
import {
  getScraperHealthSnapshot,
  listScraperJobRuns,
  listScraperSourceEvents,
  type ScraperHealthSnapshot,
  type ScraperJobRun,
  type ScraperSourceEvent
} from "./moderationRepository";
import type { ProfileStackParamList } from "./ProfileNavigator";

type Props = NativeStackScreenProps<ProfileStackParamList, "ScraperStatus">;
const SCRAPER_SOURCES = ["posh", "dice"] as const;
type ScraperSourceKey = (typeof SCRAPER_SOURCES)[number];
const SOURCE_LABELS: Record<ScraperSourceKey, string> = { posh: "POSH", dice: "DICE" };

export function ScraperStatusScreen({ navigation }: Props) {
  const [snapshot, setSnapshot] = useState<ScraperHealthSnapshot | null>(null);
  const [runs, setRuns] = useState<ScraperJobRun[]>([]);
  const [sourceEvents, setSourceEvents] = useState<Record<ScraperSourceKey, ScraperSourceEvent[]>>({ posh: [], dice: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    const [nextSnapshot, nextRuns, nextSourceEvents] = await Promise.all([
      getScraperHealthSnapshot(),
      listScraperJobRuns(10),
      listScraperSourceEvents(12)
    ]);
    setSnapshot(nextSnapshot);
    setRuns(nextRuns);
    setSourceEvents(nextSourceEvents);
    setIsLoading(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} tintColor={theme.colors.accent} progressBackgroundColor="#1A1712" />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Scraper Status</Text>
        <Text style={styles.heroMeta}>Health for the EDM scraper jobs, source coverage, and recent runs.</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading scraper status...</Text>
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.metricGrid}>
          <MetricCard label="Latest Status" value={snapshot.latestStatus.toUpperCase()} helper={snapshot.latestRunAt ? formatTimestamp(snapshot.latestRunAt) : "No run"} tone={snapshot.latestStatus === "success" ? "ok" : "critical"} />
          <MetricCard label="Fetched" value={String(snapshot.latestFetched)} helper={`Inserted ${snapshot.latestInserted} • Updated ${snapshot.latestUpdated}`} />
          <MetricCard label="Posh Upcoming" value={String(snapshot.upcomingPoshEvents)} helper="Future imported events" />
          <MetricCard label="Dice Upcoming" value={String(snapshot.upcomingDiceEvents)} helper="Future imported events" />
          <MetricCard label="Open Alerts" value={String(snapshot.openAlerts)} helper={snapshot.latestSuccessAt ? `Last success ${formatTimestamp(snapshot.latestSuccessAt)}` : "No successful run yet"} tone={snapshot.openAlerts > 0 ? "warning" : "ok"} />
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Source Mix</Text>
          <View style={styles.rowCard}>
            <Text style={styles.rowMeta}>Posh {snapshot.latestBySource.posh ?? 0}</Text>
            <Text style={styles.rowMeta}>Dice {snapshot.latestBySource.dice ?? 0}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tracked Scraper Events</Text>
        <Text style={styles.sectionMeta}>Use a source card to open the full upcoming event list when needed.</Text>
        {SCRAPER_SOURCES.map((source) => (
          <SourceSummaryCard key={source} source={source} events={sourceEvents[source]} onPress={() => navigation.navigate("ScraperSourceEvents", { source })} />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Runs</Text>
        {runs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No EDM scraper runs recorded yet.</Text>
          </View>
        ) : (
          runs.map((run) => (
            <View key={`${run.createdAt}-${run.status}`} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{formatTimestamp(run.createdAt)}</Text>
                <View style={[styles.statusBadge, run.status === "success" ? styles.statusBadgeOk : styles.statusBadgeCritical]}>
                  <Text style={styles.statusBadgeText}>{run.status}</Text>
                </View>
              </View>
              <Text style={styles.rowMeta}>Fetched {run.fetched} • Inserted {run.inserted} • Updated {run.updated}</Text>
              <Text style={styles.rowMeta}>Posh {run.bySource.posh ?? 0} • Dice {run.bySource.dice ?? 0}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function SourceSummaryCard(props: { source: ScraperSourceKey; events: ScraperSourceEvent[]; onPress: () => void }) {
  const sourceLabel = SOURCE_LABELS[props.source];
  const nextEvent = props.events[0] ?? null;

  return (
    <Pressable style={styles.sourceCard} onPress={props.onPress}>
      <View style={styles.sourceCardTop}>
        <View style={styles.sourceChip}>
          <Text style={styles.sourceChipText}>{sourceLabel}</Text>
        </View>
        <Text style={styles.sourceLinkText}>View events</Text>
      </View>
      <Text style={styles.sourceCardCount}>{props.events.length} upcoming</Text>
      <Text style={styles.sourceCardMeta}>
        {nextEvent ? `Next: ${formatTimestamp(nextEvent.startsAt)}` : "No upcoming events currently stored."}
      </Text>
      {nextEvent ? (
        <Text style={styles.sourceCardPreview} numberOfLines={2}>
          {nextEvent.title}
        </Text>
      ) : null}
    </Pressable>
  );
}

function MetricCard(props: { label: string; value: string; helper: string; tone?: "default" | "ok" | "warning" | "critical" }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={[
        styles.metricValue,
        props.tone === "ok" ? styles.metricValueOk : null,
        props.tone === "warning" ? styles.metricValueWarning : null,
        props.tone === "critical" ? styles.metricValueCritical : null
      ]}>
        {props.value}
      </Text>
      <Text style={styles.metricHelper}>{props.helper}</Text>
    </View>
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
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: {
    width: "48.5%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 4
  },
  metricLabel: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  metricValue: { color: theme.colors.textPrimary, ...theme.type.titleLg },
  metricValueOk: { color: "#9DE29D" },
  metricValueWarning: { color: "#F1C469" },
  metricValueCritical: { color: "#FF8C84" },
  metricHelper: { color: theme.colors.textSecondary, ...theme.type.caption },
  section: { gap: 8 },
  sectionTitle: { color: theme.colors.textPrimary, ...theme.type.titleSm },
  sectionMeta: { color: theme.colors.textSecondary, ...theme.type.caption },
  sourceCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 6
  },
  sourceCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sourceChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accent
  },
  sourceChipText: { color: theme.colors.textPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  sourceLinkText: { color: theme.colors.accent, fontWeight: "800" },
  sourceCardCount: { color: theme.colors.textPrimary, ...theme.type.titleSm },
  sourceCardMeta: { color: theme.colors.textSecondary, ...theme.type.caption },
  sourceCardPreview: { color: theme.colors.textPrimary, fontWeight: "700" },
  rowCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 6
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  rowTitle: { color: theme.colors.textPrimary, fontWeight: "700", flex: 1 },
  rowMeta: { color: theme.colors.textSecondary, ...theme.type.caption },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeOk: { backgroundColor: "rgba(104, 201, 108, 0.16)" },
  statusBadgeCritical: { backgroundColor: "rgba(255,98,98,0.16)" },
  statusBadgeText: { color: theme.colors.textPrimary, fontWeight: "800", textTransform: "uppercase" },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14
  },
  emptyText: { color: theme.colors.textSecondary }
});
