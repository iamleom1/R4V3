import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { theme } from "../../theme";
import { listCuratedEvents, setCuratedEventHiddenGlobally, type CuratedEvent } from "./eventCurationRepository";

type VisibilityFilter = "all" | "visible" | "hidden";

export function EventCurationScreen() {
  const [events, setEvents] = useState<CuratedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [includePast, setIncludePast] = useState(false);
  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [savingEventIds, setSavingEventIds] = useState<Set<string>>(new Set());

  async function load(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    const rows = await listCuratedEvents(includePast);
    setEvents(rows);
    setIsLoading(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, [includePast]);

  const hiddenCount = useMemo(() => events.filter((event) => event.isHidden).length, [events]);

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return events
      .filter((event) => {
        if (visibilityFilter === "visible" && event.isHidden) {
          return false;
        }
        if (visibilityFilter === "hidden" && !event.isHidden) {
          return false;
        }

        if (!needle) {
          return true;
        }

        const searchable = [event.title, event.venueName, event.city, event.sourcePrimary].filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(needle);
      })
      .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));
  }, [events, query, visibilityFilter]);

  async function updateEventVisibility(event: CuratedEvent, isHidden: boolean) {
    const matchingEvents = events.filter((candidate) => areLikelyDuplicateEvents(candidate, event));
    setSavingEventIds((prev) => {
      const next = new Set(prev);
      for (const candidate of matchingEvents) {
        next.add(candidate.eventId);
      }
      return next;
    });

    const result = await setCuratedEventHiddenGlobally(event.eventId, isHidden);

    setSavingEventIds((prev) => {
      const next = new Set(prev);
      for (const candidate of matchingEvents) {
        next.delete(candidate.eventId);
      }
      return next;
    });

    if (!result.ok) {
      Alert.alert("Update failed", result.error);
      return;
    }

    const matchingEventIds = new Set(result.updatedEventIds.length > 0 ? result.updatedEventIds : matchingEvents.map((candidate) => candidate.eventId));
    setEvents((prev) => prev.map((item) => (matchingEventIds.has(item.eventId) ? { ...item, isHidden } : item)));
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Event Curation</Text>
        <Text style={styles.meta}>{events.length} events • {hiddenCount} hidden</Text>
      </View>

      <View style={styles.topRow}>
        <Pressable style={[styles.pill, includePast && styles.pillActive]} onPress={() => setIncludePast((prev) => !prev)}>
          <Text style={[styles.pillText, includePast && styles.pillTextActive]}>{includePast ? "Including past" : "Upcoming only"}</Text>
        </Pressable>
        <Pressable style={styles.pill} onPress={() => void load(true)}>
          <Text style={styles.pillText}>Refresh</Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        style={styles.searchInput}
        placeholder="Search events"
        placeholderTextColor={theme.colors.textSecondary}
      />

      <View style={styles.filterRow}>
        <FilterButton label="All" active={visibilityFilter === "all"} onPress={() => setVisibilityFilter("all")} />
        <FilterButton label="Visible" active={visibilityFilter === "visible"} onPress={() => setVisibilityFilter("visible")} />
        <FilterButton label="Hidden" active={visibilityFilter === "hidden"} onPress={() => setVisibilityFilter("hidden")} />
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.eventId}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void load(true)}
              tintColor={theme.colors.accent}
              progressBackgroundColor="#1A1712"
            />
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No events match this filter.</Text>}
          renderItem={({ item }) => {
            const isSaving = savingEventIds.has(item.eventId);
            return (
              <View style={styles.row}>
                {item.flyerUrl ? <Image source={{ uri: item.flyerUrl }} style={styles.artwork} resizeMode="cover" /> : <View style={styles.artworkPlaceholder}><Text style={styles.artworkPlaceholderText}>E</Text></View>}
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, item.isHidden && styles.rowTitleHidden]} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{[item.venueName, item.city].filter(Boolean).join(" • ") || "Unknown venue"}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{formatTimestamp(item.startsAt)}</Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    style={[styles.actionButton, item.isHidden ? styles.unhideButton : styles.hideButton, isSaving && styles.actionButtonDisabled]}
                    disabled={isSaving}
                    onPress={() => void updateEventVisibility(item, !item.isHidden)}
                  >
                    <Text style={styles.actionButtonText}>{isSaving ? "..." : item.isHidden ? "Show" : "Hide"}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function FilterButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.filterButton, props.active && styles.filterButtonActive]} onPress={props.onPress}>
      <Text style={[styles.filterButtonText, props.active && styles.filterButtonTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function areLikelyDuplicateEvents(left: CuratedEvent, right: CuratedEvent) {
  return normalizeEventKey(left.title) === normalizeEventKey(right.title)
    && normalizeEventKey(left.city ?? "") === normalizeEventKey(right.city ?? "")
    && getCalendarDayKey(left.startsAt) === getCalendarDayKey(right.startsAt);
}

function normalizeEventKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCalendarDayKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
    padding: 14,
    gap: 10
  },
  header: {
    gap: 2
  },
  title: {
    color: "#F5F5F5",
    ...theme.type.titleLg
  },
  meta: {
    color: "#9B9B9B",
    ...theme.type.caption
  },
  topRow: {
    flexDirection: "row",
    gap: 8
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#111",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  pillActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,179,71,0.16)"
  },
  pillText: {
    color: "#C8C8C8",
    fontWeight: "700"
  },
  pillTextActive: {
    color: "#FFF"
  },
  searchInput: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#222",
    backgroundColor: "#0F0F0F",
    color: "#F5F5F5",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  filterRow: {
    flexDirection: "row",
    gap: 8
  },
  filterButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#111"
  },
  filterButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(255,179,71,0.16)"
  },
  filterButtonText: {
    color: "#B3B3B3",
    fontWeight: "700",
    fontSize: 12
  },
  filterButtonTextActive: {
    color: "#FFF"
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12
  },
  loadingText: {
    color: "#A9A9A9"
  },
  listContent: {
    paddingBottom: 28
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#232323",
    marginLeft: 66
  },
  emptyText: {
    color: "#A9A9A9",
    textAlign: "center",
    paddingVertical: 24
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#1A1A1A"
  },
  artworkPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#171717",
    alignItems: "center",
    justifyContent: "center"
  },
  artworkPlaceholderText: {
    color: "#6F6F6F",
    fontWeight: "700"
  },
  rowBody: {
    flex: 1,
    gap: 2
  },
  rowTitle: {
    color: "#F1F1F1",
    fontSize: 18,
    fontWeight: "500"
  },
  rowTitleHidden: {
    color: "#767676",
    textDecorationLine: "line-through"
  },
  rowSub: {
    color: "#8D8D8D",
    fontSize: 13
  },
  rowActions: {
    justifyContent: "center",
    alignItems: "flex-end"
  },
  actionButton: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1
  },
  hideButton: {
    borderColor: "#FF5F57",
    backgroundColor: "rgba(255,95,87,0.12)"
  },
  unhideButton: {
    borderColor: "#2ED573",
    backgroundColor: "rgba(46,213,115,0.12)"
  },
  actionButtonDisabled: {
    opacity: 0.7
  },
  actionButtonText: {
    color: "#F5F5F5",
    fontSize: 12,
    fontWeight: "700"
  }
});
