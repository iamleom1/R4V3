import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";
import { listSystemAlerts, resolveSystemAlert, type SystemAlert } from "./moderationRepository";

const filters: Array<SystemAlert["status"] | "all"> = ["open", "resolved", "all"];

export function SystemAlertsScreen() {
  const [items, setItems] = useState<SystemAlert[]>([]);
  const [status, setStatus] = useState<SystemAlert["status"] | "all">("open");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    const rows = await listSystemAlerts(status);
    setItems(rows);
    setIsLoading(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, [status]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} tintColor={theme.colors.accent} progressBackgroundColor="#1A1712" />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>System Alerts</Text>
        <Text style={styles.heroMeta}>{items.length} visible</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {filters.map((filter) => {
          const selected = status === filter;
          return (
            <Pressable key={filter} style={[styles.filterChip, selected && styles.filterChipSelected]} onPress={() => setStatus(filter)}>
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{filter}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading alerts...</Text>
        </View>
      ) : null}

      {items.map((item) => (
        <View key={item.alertId} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={[styles.badge, item.severity === "critical" ? styles.badgeCritical : item.severity === "warning" ? styles.badgeWarning : styles.badgeInfo]}>
              <Text style={styles.badgeText}>{item.severity}</Text>
            </View>
            <Text style={styles.cardTime}>{formatTimestamp(item.createdAt)}</Text>
          </View>
          <Text style={styles.cardTitle}>{item.message}</Text>
          <Text style={styles.cardMeta}>{item.category}</Text>
          <Text style={styles.cardBody}>{JSON.stringify(item.details)}</Text>
          {item.status === "open" ? (
            <Pressable
              style={styles.resolveButton}
              onPress={() => {
                void resolveSystemAlert(item.alertId).then((result) => {
                  if (!result.ok) {
                    Alert.alert("Resolve failed", result.error);
                    return;
                  }
                  void load(true);
                });
              }}
            >
              <Text style={styles.resolveButtonText}>Resolve</Text>
            </Pressable>
          ) : null}
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
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 8
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeCritical: { backgroundColor: "rgba(255,98,98,0.16)" },
  badgeWarning: { backgroundColor: "rgba(241,196,105,0.18)" },
  badgeInfo: { backgroundColor: "rgba(106,182,255,0.18)" },
  badgeText: { color: theme.colors.textPrimary, fontWeight: "800", textTransform: "uppercase" },
  cardTime: { color: theme.colors.textSecondary, ...theme.type.caption },
  cardTitle: { color: theme.colors.textPrimary, ...theme.type.titleSm },
  cardMeta: { color: theme.colors.textSecondary, fontWeight: "700" },
  cardBody: { color: theme.colors.textSecondary },
  resolveButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  resolveButtonText: { color: theme.colors.textPrimary, fontWeight: "800" }
});
