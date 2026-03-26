import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";
import { listModerationQueue, moderateProfileAction, type ModerationQueueItem, updateReportStatus } from "./moderationRepository";

const filters: Array<ModerationQueueItem["queueStatus"] | "all"> = ["all", "queued", "in_review", "resolved", "dismissed"];

export function ModerationQueueScreen() {
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<ModerationQueueItem["queueStatus"] | "all">("queued");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    const rows = await listModerationQueue(statusFilter);
    setItems(rows);

    if (!refresh) {
      setIsLoading(false);
    }
    setIsRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const summary = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.queueStatus] = (acc[item.queueStatus] ?? 0) + 1;
      return acc;
    }, {});
  }, [items]);

  async function handleStatusUpdate(item: ModerationQueueItem, status: ModerationQueueItem["queueStatus"]) {
    const result = await updateReportStatus({ reportId: item.reportId, status });
    if (!result.ok) {
      Alert.alert("Update failed", result.error);
      return;
    }
    void load(true);
  }

  async function handleProfileAction(
    item: ModerationQueueItem,
    actionType: "hide_profile" | "unhide_profile" | "suspend_profile" | "unsuspend_profile"
  ) {
    if (!item.targetProfileId) {
      Alert.alert("No target profile", "This report does not point to a profile.");
      return;
    }

    const suspendUntil =
      actionType === "suspend_profile"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const result = await moderateProfileAction({
      targetProfileId: item.targetProfileId,
      actionType,
      note: `${item.reportCategory}: ${item.reportDetails ?? "moderation action"}`,
      suspendUntil
    });
    if (!result.ok) {
      Alert.alert("Action failed", result.error);
      return;
    }
    const confirmationMessage =
      actionType === "hide_profile"
        ? "Profile hidden."
        : actionType === "unhide_profile"
          ? "Profile restored to discovery."
          : actionType === "unsuspend_profile"
            ? "Profile suspension removed."
            : "Profile suspended for 7 days.";
    Alert.alert("Profile updated", confirmationMessage);
    void load(true);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void load(true)}
          tintColor={theme.colors.accent}
          progressBackgroundColor="#1A1712"
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Moderation Queue</Text>
        <Text style={styles.heroMeta}>
          {items.length} visible
          {"  "}
          {summary.queued ? `Queued ${summary.queued}` : ""}
          {summary.in_review ? `  Review ${summary.in_review}` : ""}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {filters.map((filter) => {
          const selected = filter === statusFilter;
          return (
            <Pressable key={filter} style={[styles.filterChip, selected && styles.filterChipSelected]} onPress={() => setStatusFilter(filter)}>
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{filter.replace("_", " ")}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading queue...</Text>
        </View>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No reports in this view.</Text>
          <Text style={styles.emptyMeta}>Switch filters or pull to refresh.</Text>
        </View>
      ) : null}

      {items.map((item) => (
        <View key={item.queueId} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.badgeRow}>
              <View style={[styles.priorityBadge, priorityStyle(item.priority)]}>
                <Text style={styles.priorityBadgeText}>P{item.priority}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{item.queueStatus.replace("_", " ")}</Text>
              </View>
            </View>
            <Text style={styles.timeText}>{formatTimestamp(item.reportedAt)}</Text>
          </View>

          <Text style={styles.cardTitle}>{item.reportCategory}</Text>
          <Text style={styles.cardMeta}>
            Reporter: {item.reporterDisplayName}
            {item.targetDisplayName ? `  Target: ${item.targetDisplayName}` : ""}
          </Text>
          {item.targetProfileId ? (
            <Text style={styles.cardState}>
              State: {item.targetIsHidden ? "Hidden" : "Visible"}
              {"  "}
              {item.targetIsSuspended ? `Suspended${item.targetSuspendedUntil ? ` until ${formatTimestamp(item.targetSuspendedUntil)}` : ""}` : "Active"}
            </Text>
          ) : null}
          {item.reportDetails ? <Text style={styles.cardBody}>{item.reportDetails}</Text> : null}
          {item.messageBody ? <Text style={styles.messageQuote} numberOfLines={3}>“{item.messageBody}”</Text> : null}

          <View style={styles.actionRow}>
            {item.queueStatus !== "in_review" ? (
              <ActionButton label="Review" onPress={() => void handleStatusUpdate(item, "in_review")} />
            ) : null}
            {item.queueStatus !== "resolved" ? (
              <ActionButton label="Resolve" onPress={() => void handleStatusUpdate(item, "resolved")} />
            ) : null}
            {item.queueStatus !== "dismissed" ? (
              <ActionButton label="Dismiss" variant="ghost" onPress={() => void handleStatusUpdate(item, "dismissed")} />
            ) : null}
            {item.targetProfileId ? (
              <ActionButton
                label={item.targetIsHidden ? "Unhide Profile" : "Hide Profile"}
                variant="ghost"
                onPress={() => void handleProfileAction(item, item.targetIsHidden ? "unhide_profile" : "hide_profile")}
              />
            ) : null}
            {item.targetProfileId ? (
              <ActionButton
                label={item.targetIsSuspended ? "Unsuspend" : "Suspend 7d"}
                variant="ghost"
                onPress={() => void handleProfileAction(item, item.targetIsSuspended ? "unsuspend_profile" : "suspend_profile")}
              />
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function ActionButton(props: { label: string; onPress: () => void; variant?: "default" | "ghost" }) {
  const ghost = props.variant === "ghost";
  return (
    <Pressable style={[styles.actionButton, ghost && styles.actionButtonGhost]} onPress={props.onPress}>
      <Text style={[styles.actionButtonText, ghost && styles.actionButtonTextGhost]}>{props.label}</Text>
    </Pressable>
  );
}

function priorityStyle(priority: number) {
  if (priority === 0) return styles.priorityUrgent;
  if (priority === 1) return styles.priorityHigh;
  return styles.priorityNormal;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  },
  container: {
    padding: 16,
    gap: 12
  },
  hero: {
    gap: 4
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleLg
  },
  heroMeta: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  filterRow: {
    gap: 8
  },
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
  filterChipText: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  filterChipTextSelected: {
    color: theme.colors.textPrimary
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
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 4
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleSm
  },
  emptyMeta: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 10
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center"
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  priorityBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  priorityUrgent: {
    backgroundColor: "#592126"
  },
  priorityHigh: {
    backgroundColor: "#5B3714"
  },
  priorityNormal: {
    backgroundColor: "#2B251D"
  },
  priorityBadgeText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "800"
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusBadgeText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  timeText: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleSm,
    textTransform: "capitalize"
  },
  cardMeta: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  cardState: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  cardBody: {
    color: theme.colors.textPrimary,
    ...theme.type.body
  },
  messageQuote: {
    color: "#FFD9C7",
    fontStyle: "italic",
    lineHeight: 20
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  actionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  actionButtonGhost: {
    backgroundColor: "transparent",
    borderColor: theme.colors.border
  },
  actionButtonText: {
    color: "#FFF8EE",
    fontWeight: "700"
  },
  actionButtonTextGhost: {
    color: theme.colors.textPrimary
  }
});
