import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { Button } from "../../components/ui/Button";
import { theme } from "../../theme";
import { listCuratedEvents, type CuratedEvent, upsertCuratedEvent } from "./eventCurationRepository";

type Draft = {
  eventId: string | null;
  title: string;
  venueName: string;
  city: string;
  startsAt: string;
  endsAt: string;
  genreTags: string;
  isFeatured: boolean;
  promotionRank: string;
  featuredUntil: string;
  curationNote: string;
  flyerUrl: string;
};

const emptyDraft: Draft = {
  eventId: null,
  title: "",
  venueName: "",
  city: "Los Angeles",
  startsAt: "",
  endsAt: "",
  genreTags: "",
  isFeatured: false,
  promotionRank: "0",
  featuredUntil: "",
  curationNote: "",
  flyerUrl: ""
};

export function EventCurationScreen() {
  const [events, setEvents] = useState<CuratedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [includePast, setIncludePast] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    const rows = await listCuratedEvents(includePast);
    setEvents(rows);
    setIsLoading(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, [includePast]);

  const featuredCount = useMemo(() => events.filter((event) => event.isFeatured).length, [events]);

  function hydrateDraft(event: CuratedEvent) {
    setDraft({
      eventId: event.eventId,
      title: event.title,
      venueName: event.venueName ?? "",
      city: event.city ?? "",
      startsAt: toLocalInputValue(event.startsAt),
      endsAt: event.endsAt ? toLocalInputValue(event.endsAt) : "",
      genreTags: event.genreTags.join(", "),
      isFeatured: event.isFeatured,
      promotionRank: String(event.promotionRank ?? 0),
      featuredUntil: event.featuredUntil ? toLocalInputValue(event.featuredUntil) : "",
      curationNote: event.curationNote ?? "",
      flyerUrl: event.flyerUrl ?? ""
    });
  }

  function resetDraft() {
    setDraft(emptyDraft);
  }

  async function handleSave() {
    const title = draft.title.trim();
    if (!title) {
      Alert.alert("Missing title", "Title is required.");
      return;
    }

    const startsAt = normalizeDateInput(draft.startsAt);
    if (!startsAt) {
      Alert.alert("Invalid start time", "Use a valid date/time, for example 2026-03-20T21:00.");
      return;
    }

    const endsAt = normalizeDateInput(draft.endsAt);
    const featuredUntil = normalizeDateInput(draft.featuredUntil);
    const promotionRank = clampRank(draft.promotionRank);

    setIsSaving(true);
    const result = await upsertCuratedEvent({
      eventId: draft.eventId,
      title,
      venueName: draft.venueName.trim() || null,
      city: draft.city.trim() || null,
      startsAt,
      endsAt,
      genreTags: draft.genreTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      isFeatured: draft.isFeatured,
      promotionRank,
      featuredUntil,
      curationNote: draft.curationNote.trim() || null,
      flyerUrl: draft.flyerUrl.trim() || null
    });
    setIsSaving(false);

    if (!result.ok) {
      if (result.duplicateEventId) {
        Alert.alert("Possible duplicate", "An event with a very similar title, city, and start time already exists. Edit the existing event instead of creating a duplicate.");
      } else {
        Alert.alert("Save failed", result.error);
      }
      return;
    }

    Alert.alert("Saved", "Event curation updated.");
    resetDraft();
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
        <Text style={styles.heroTitle}>Event Curation</Text>
        <Text style={styles.heroMeta}>{events.length} upcoming • {featuredCount} featured</Text>
      </View>

      <View style={styles.toolbar}>
        <Pressable style={[styles.filterChip, includePast && styles.filterChipSelected]} onPress={() => setIncludePast((prev) => !prev)}>
          <Text style={[styles.filterChipText, includePast && styles.filterChipTextSelected]}>
            {includePast ? "Including past" : "Upcoming only"}
          </Text>
        </Pressable>
        <Button label="New Curated Event" variant="secondary" onPress={resetDraft} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{draft.eventId ? "Edit Event" : "Create Curated Event"}</Text>
        <View style={styles.fieldGrid}>
          <LabeledField label="Title">
            <TextInput value={draft.title} onChangeText={(title) => setDraft((prev) => ({ ...prev, title }))} style={styles.input} placeholder="Event title" placeholderTextColor={theme.colors.textSecondary} />
          </LabeledField>
          <LabeledField label="Venue">
            <TextInput value={draft.venueName} onChangeText={(venueName) => setDraft((prev) => ({ ...prev, venueName }))} style={styles.input} placeholder="Venue name" placeholderTextColor={theme.colors.textSecondary} />
          </LabeledField>
          <LabeledField label="City">
            <TextInput value={draft.city} onChangeText={(city) => setDraft((prev) => ({ ...prev, city }))} style={styles.input} placeholder="City" placeholderTextColor={theme.colors.textSecondary} />
          </LabeledField>
          <LabeledField label="Starts At">
            <TextInput value={draft.startsAt} onChangeText={(startsAt) => setDraft((prev) => ({ ...prev, startsAt }))} style={styles.input} placeholder="2026-03-20T21:00" placeholderTextColor={theme.colors.textSecondary} autoCapitalize="none" />
          </LabeledField>
          <LabeledField label="Ends At">
            <TextInput value={draft.endsAt} onChangeText={(endsAt) => setDraft((prev) => ({ ...prev, endsAt }))} style={styles.input} placeholder="Optional" placeholderTextColor={theme.colors.textSecondary} autoCapitalize="none" />
          </LabeledField>
          <LabeledField label="Genre Tags">
            <TextInput value={draft.genreTags} onChangeText={(genreTags) => setDraft((prev) => ({ ...prev, genreTags }))} style={styles.input} placeholder="House, Tech House, Warehouse" placeholderTextColor={theme.colors.textSecondary} />
          </LabeledField>
          <LabeledField label="Promotion Rank">
            <TextInput value={draft.promotionRank} onChangeText={(promotionRank) => setDraft((prev) => ({ ...prev, promotionRank }))} style={styles.input} placeholder="0-100" placeholderTextColor={theme.colors.textSecondary} keyboardType="number-pad" />
          </LabeledField>
          <LabeledField label="Featured Until">
            <TextInput value={draft.featuredUntil} onChangeText={(featuredUntil) => setDraft((prev) => ({ ...prev, featuredUntil }))} style={styles.input} placeholder="Optional" placeholderTextColor={theme.colors.textSecondary} autoCapitalize="none" />
          </LabeledField>
          <LabeledField label="Flyer URL">
            <TextInput value={draft.flyerUrl} onChangeText={(flyerUrl) => setDraft((prev) => ({ ...prev, flyerUrl }))} style={styles.input} placeholder="https://..." placeholderTextColor={theme.colors.textSecondary} autoCapitalize="none" />
          </LabeledField>
        </View>

        {draft.flyerUrl.trim() ? (
          <View style={styles.flyerPreviewCard}>
            <Text style={styles.fieldLabel}>Flyer Preview</Text>
            <Image source={{ uri: draft.flyerUrl.trim() }} style={styles.flyerPreviewImage} resizeMode="cover" />
          </View>
        ) : null}

        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleLabel}>Feature this event</Text>
            <Text style={styles.toggleMeta}>Featured events receive ranking boosts and editorial labeling.</Text>
          </View>
          <Switch
            value={draft.isFeatured}
            onValueChange={(isFeatured) => setDraft((prev) => ({ ...prev, isFeatured }))}
            trackColor={{ false: "rgba(255,255,255,0.2)", true: theme.colors.accent }}
            thumbColor="#fff"
          />
        </View>

        <LabeledField label="Internal Note">
          <TextInput value={draft.curationNote} onChangeText={(curationNote) => setDraft((prev) => ({ ...prev, curationNote }))} style={[styles.input, styles.noteInput]} placeholder="Why is this being promoted?" placeholderTextColor={theme.colors.textSecondary} multiline />
        </LabeledField>

        <View style={styles.actionRow}>
          <Button label={draft.eventId ? "Save Changes" : "Create Event"} loading={isSaving} onPress={() => void handleSave()} />
          {draft.eventId ? <Button label="Clear" variant="ghost" onPress={resetDraft} /> : null}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading curated events...</Text>
        </View>
      ) : null}

      {events.map((event) => (
        <Pressable key={event.eventId} style={styles.card} onPress={() => hydrateDraft(event)}>
          {event.flyerUrl ? <Image source={{ uri: event.flyerUrl }} style={styles.cardFlyer} resizeMode="cover" /> : null}
          <View style={styles.cardTop}>
            <View style={styles.badges}>
              {event.isFeatured ? (
                <View style={[styles.badge, styles.badgeFeatured]}>
                  <Text style={styles.badgeText}>R4V3 Pick</Text>
                </View>
              ) : null}
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{event.sourcePrimary}</Text>
              </View>
            </View>
            <Text style={styles.rankText}>Rank {event.promotionRank}</Text>
          </View>
          <Text style={styles.cardTitle}>{event.title}</Text>
          <Text style={styles.cardMeta}>
            {[event.venueName, event.city, formatTimestamp(event.startsAt)].filter(Boolean).join(" • ")}
          </Text>
          {event.genreTags.length > 0 ? <Text style={styles.cardGenres}>{event.genreTags.join(" • ")}</Text> : null}
          {event.curationNote ? <Text style={styles.cardNote}>{event.curationNote}</Text> : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function LabeledField(props: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      {props.children}
    </View>
  );
}

function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toLocalInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function clampRank(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
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
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
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
    fontWeight: "700"
  },
  filterChipTextSelected: {
    color: theme.colors.textPrimary
  },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 12
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleSm
  },
  fieldGrid: {
    gap: 10
  },
  field: {
    gap: 6
  },
  fieldLabel: {
    color: theme.colors.textSecondary,
    fontWeight: "700"
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "#17120E",
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  noteInput: {
    minHeight: 90,
    textAlignVertical: "top"
  },
  flyerPreviewCard: {
    gap: 8
  },
  flyerPreviewImage: {
    width: "100%",
    height: 180,
    borderRadius: 16,
    backgroundColor: "#110F0C"
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  toggleCopy: {
    flex: 1,
    gap: 4
  },
  toggleLabel: {
    color: theme.colors.textPrimary,
    fontWeight: "700"
  },
  toggleMeta: {
    color: theme.colors.textSecondary
  },
  actionRow: {
    gap: 10
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
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 8
  },
  cardFlyer: {
    width: "100%",
    height: 160,
    borderRadius: 16,
    backgroundColor: "#110F0C"
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  badges: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  badgeFeatured: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft
  },
  badgeText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  rankText: {
    color: theme.colors.textSecondary,
    fontWeight: "700"
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleSm
  },
  cardMeta: {
    color: theme.colors.textSecondary
  },
  cardGenres: {
    color: theme.colors.textPrimary,
    fontWeight: "600"
  },
  cardNote: {
    color: theme.colors.textSecondary
  }
});
