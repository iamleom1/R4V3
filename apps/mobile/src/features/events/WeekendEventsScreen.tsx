import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppState } from "../../app/AppProvider";
import { theme } from "../../theme";
import type { EventRecord, RSVPStatus } from "../../types/domain";
import { hasEventCrewChat, listEventAudienceMetrics } from "./eventRepository";
import type { DiscoverStackParamList } from "./DiscoverNavigator";
import { useEventRsvpState } from "./useEventRsvpState";

type Props = NativeStackScreenProps<DiscoverStackParamList, "WeekendEvents">;

export function WeekendEventsScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAppState();
  const { rsvps, setRsvp } = useEventRsvpState(session?.user?.id ?? null);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audienceMetrics, setAudienceMetrics] = useState<Record<string, { goingCount: number; lookingForCrewCount: number }>>({});

  const orderedEvents = useMemo(() => {
    const selected = route.params.selectedEventId;
    const sorted = [...route.params.weekendEvents].sort((a, b) => {
      const ta = new Date(a.startsAt).getTime();
      const tb = new Date(b.startsAt).getTime();
      return ta - tb;
    });
    if (!selected) return sorted;
    return sorted.sort((a, b) => (a.id === selected ? -1 : b.id === selected ? 1 : 0));
  }, [route.params.weekendEvents, route.params.selectedEventId]);

  React.useEffect(() => {
    let active = true;
    async function loadMetrics() {
      const metrics = await listEventAudienceMetrics(orderedEvents.map((event) => event.id));
      if (!active) return;
      setAudienceMetrics(metrics);
    }
    void loadMetrics();
    return () => {
      active = false;
    };
  }, [orderedEvents]);

  async function handleRsvp(eventId: string, status: RSVPStatus) {
    if (!session?.user?.id) {
      const rootNav: any = navigation.getParent()?.getParent();
      rootNav?.navigate?.("Auth");
      return;
    }
    setIsSavingId(eventId);
    setError(null);
    const result = await setRsvp(eventId, status);
    if (!result.ok) {
      setError(result.error);
      setIsSavingId(null);
      return;
    }
    const metrics = await listEventAudienceMetrics([eventId]);
    setAudienceMetrics((prev) => ({ ...prev, ...metrics }));
    setIsSavingId(null);
  }

  async function handleGoingPress(event: EventRecord) {
    const current = rsvps[event.id];
    if (current === "going" && session?.user?.id) {
      const inCrewChat = await hasEventCrewChat(session.user.id, event.id);
      const message = inCrewChat
        ? "You’ll exit this event and be removed from your crew chat."
        : "You’ll be removed from crew matching for this event.";
      Alert.alert("Leave Event?", message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave Event",
          style: "destructive",
          onPress: () => void handleRsvp(event.id, "none")
        }
      ]);
      return;
    }
    void handleRsvp(event.id, "going");
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: Math.max(insets.top + 10, 26), paddingBottom: Math.max(insets.bottom + 24, 30) }
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.headerEyebrow}>Events This Weekend</Text>
          <Text style={styles.headerTitle}>Thu • Fri • Sat</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.cardList}>
        {orderedEvents.map((event, idx) => {
          const palette = getWeekendPalette(idx);
          const isGoing = rsvps[event.id] === "going";
          const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
          const goingCount = metrics.goingCount;
          const crewCount = metrics.lookingForCrewCount;
          return (
            <Pressable
              key={event.id}
              onPress={() => navigation.navigate("EventDetail", { event })}
              style={[styles.card, { backgroundColor: palette.base }]}
            >
              <View style={[styles.glow, { backgroundColor: palette.glow }]} />
              <View style={[styles.glow, styles.glowRight, { backgroundColor: palette.glowRight }]} />
              <View style={[styles.beam, { backgroundColor: palette.beamA, transform: [{ rotate: "-8deg" }] }]} />
              <View style={[styles.beam, styles.beamTwo, { backgroundColor: palette.beamB, transform: [{ rotate: "6deg" }] }]} />

              <View style={styles.cardTop}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>{event.city || "City TBD"} • {formatEventDate(event.startsAt)}</Text>
              </View>

              <View style={styles.metricsRow}>
                <Text style={styles.metricPrimary}>{goingCount} going</Text>
                <Text style={styles.metricSecondary}>{crewCount} looking for crew</Text>
              </View>

              <Pressable
                onPress={(pressEvent) => {
                  pressEvent.stopPropagation();
                  void handleGoingPress(event);
                }}
                style={[styles.goingButton, isGoing && styles.goingButtonActive]}
              >
                {isSavingId === event.id ? (
                  <ActivityIndicator color={theme.colors.textPrimary} />
                ) : (
                  <Text style={styles.goingButtonText}>{isGoing ? "Leave Event" : "Going"}</Text>
                )}
              </Pressable>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function formatEventDate(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return startsAt;
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function getWeekendPalette(index: number) {
  const palettes = [
    { base: "#1C1310", glow: "rgba(239,124,74,0.36)", glowRight: "rgba(163,89,255,0.25)", beamA: "rgba(255,169,110,0.38)", beamB: "rgba(186,124,255,0.35)" },
    { base: "#171327", glow: "rgba(135,99,255,0.38)", glowRight: "rgba(236,113,164,0.22)", beamA: "rgba(167,131,255,0.35)", beamB: "rgba(255,165,120,0.3)" },
    { base: "#171A22", glow: "rgba(81,143,255,0.34)", glowRight: "rgba(172,101,255,0.2)", beamA: "rgba(151,192,255,0.3)", beamB: "rgba(208,127,255,0.26)" }
  ];
  return palettes[index % palettes.length];
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 14,
    backgroundColor: theme.colors.canvas
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  backButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 28,
    marginTop: -2
  },
  headerEyebrow: {
    color: theme.colors.textSecondary,
    ...theme.type.eyebrow
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleMd
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  cardList: {
    gap: 12
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
    overflow: "hidden",
    gap: 12
  },
  glow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    left: -60,
    top: -70,
    opacity: 0.9
  },
  glowRight: {
    left: undefined,
    right: -58,
    top: -46
  },
  beam: {
    position: "absolute",
    left: -24,
    right: -24,
    top: 70,
    height: 16,
    borderRadius: 10
  },
  beamTwo: {
    top: 94
  },
  cardTop: {
    gap: 2
  },
  eventTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: "800"
  },
  eventMeta: {
    color: "rgba(255,255,255,0.82)",
    ...theme.type.body
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  metricPrimary: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800"
  },
  metricSecondary: {
    color: "#C99EFF",
    fontSize: 14,
    fontWeight: "700"
  },
  goingButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(20,28,46,0.75)",
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center"
  },
  goingButtonActive: {
    borderColor: "rgba(255,130,82,0.75)",
    backgroundColor: "rgba(255,108,52,0.22)"
  },
  goingButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800"
  }
});
