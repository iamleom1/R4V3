import React, { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";
import {
  getAdminAnalyticsSnapshot,
  listAdminRecentErrors,
  listAdminTopEvents,
  type AnalyticsSnapshot,
  type RecentClientError,
  type TopAnalyticsEvent
} from "./moderationRepository";

const windowOptions = [
  { label: "24h", value: 24 },
  { label: "7d", value: 168 }
] as const;

export function AdminAnalyticsScreen() {
  const [windowHours, setWindowHours] = useState<24 | 168>(24);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [topEvents, setTopEvents] = useState<TopAnalyticsEvent[]>([]);
  const [recentErrors, setRecentErrors] = useState<RecentClientError[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    const [nextSnapshot, nextTopEvents, nextRecentErrors] = await Promise.all([
      getAdminAnalyticsSnapshot(windowHours),
      listAdminTopEvents(windowHours, 8),
      listAdminRecentErrors(windowHours, 8)
    ]);

    setSnapshot(nextSnapshot);
    setTopEvents(nextTopEvents);
    setRecentErrors(nextRecentErrors);
    setIsLoading(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, [windowHours]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} tintColor={theme.colors.accent} progressBackgroundColor="#1A1712" />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Analytics</Text>
        <Text style={styles.heroMeta}>Client events, errors, job failures, and open alerts.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {windowOptions.map((option) => {
          const selected = option.value === windowHours;
          return (
            <Pressable key={option.label} style={[styles.filterChip, selected && styles.filterChipSelected]} onPress={() => setWindowHours(option.value)}>
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.metricGrid}>
          <MetricCard label="Events" value={String(snapshot.totalEvents)} helper={snapshot.lastEventAt ? `Last ${formatTimestamp(snapshot.lastEventAt)}` : "No recent event"} />
          <MetricCard label="Unique Names" value={String(snapshot.uniqueEventNames)} helper={`Window ${windowHours === 24 ? "24h" : "7d"}`} />
          <MetricCard label="Client Errors" value={String(snapshot.totalErrors)} helper={snapshot.lastErrorAt ? `Last ${formatTimestamp(snapshot.lastErrorAt)}` : "No recent error"} />
          <MetricCard label="Fatal Errors" value={String(snapshot.fatalErrors)} helper="Captured via client reporter" />
          <MetricCard label="Failed Jobs" value={String(snapshot.failedJobs)} helper="From job_runs" />
          <MetricCard label="Open Alerts" value={String(snapshot.openAlerts)} helper="From system_alerts" />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Events</Text>
        <Text style={styles.sectionMeta}>Most frequent client events in the selected window.</Text>
        {topEvents.length === 0 ? (
          <EmptyState label="No event traffic captured in this window." />
        ) : (
          topEvents.map((item) => (
            <View key={item.eventName} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{item.eventName}</Text>
                <Text style={styles.rowCount}>{item.totalCount}</Text>
              </View>
              <Text style={styles.rowMeta}>{item.uniqueProfiles} profiles • Last {formatTimestamp(item.lastSeenAt)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Errors</Text>
        <Text style={styles.sectionMeta}>Latest grouped client failures in the selected window.</Text>
        {recentErrors.length === 0 ? (
          <EmptyState label="No client errors captured yet." />
        ) : (
          recentErrors.map((item) => (
            <View key={`${item.message}-${item.lastSeenAt}`} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.message}
                </Text>
                <Text style={[styles.rowCount, item.fatalCount > 0 && styles.rowCountCritical]}>{item.totalCount}</Text>
              </View>
              <Text style={styles.rowMeta}>
                Fatal {item.fatalCount} • Last {formatTimestamp(item.lastSeenAt)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function MetricCard(props: { label: string; value: string; helper: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={styles.metricValue}>{props.value}</Text>
      <Text style={styles.metricHelper}>{props.helper}</Text>
    </View>
  );
}

function EmptyState(props: { label: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{props.label}</Text>
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
  filterRow: { gap: 8 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft
  },
  filterChipText: { color: theme.colors.textSecondary, fontWeight: "700" },
  filterChipTextSelected: { color: theme.colors.textPrimary },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { color: theme.colors.textSecondary },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metricCard: {
    width: "48.5%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 4
  },
  metricLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  metricValue: {
    color: theme.colors.textPrimary,
    ...theme.type.titleLg
  },
  metricHelper: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  section: {
    gap: 8
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleSm
  },
  sectionMeta: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  rowCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 6
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
  },
  rowTitle: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontWeight: "700"
  },
  rowCount: {
    color: theme.colors.textPrimary,
    fontWeight: "800"
  },
  rowCountCritical: {
    color: "#FF8C84"
  },
  rowMeta: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14
  },
  emptyText: {
    color: theme.colors.textSecondary
  }
});
