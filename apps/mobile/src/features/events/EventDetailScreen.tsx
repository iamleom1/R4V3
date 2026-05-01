import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppState } from "../../app/AppProvider";
import { RemoteImage } from "../../components/RemoteImage";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";
import type { EventRecord, RSVPStatus } from "../../types/domain";
import { hasEventCrewChat, joinEventCrewRoom, listEventAudienceMetrics, listEventCrewRooms, startEventCrewThreadSeed, type EventCrewRoom } from "./eventRepository";
import type { DiscoverStackParamList } from "./DiscoverNavigator";
import { getEventLocationInfo, getEventLocationSummary } from "./eventLocation";
import { useCrewVisibilityState } from "./useCrewVisibilityState";
import { useEventRsvpState } from "./useEventRsvpState";

type Props = NativeStackScreenProps<DiscoverStackParamList, "EventDetail">;

export function EventDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAppState();
  const { rsvps, setRsvp, refreshRsvps } = useEventRsvpState(session?.user?.id ?? null);
  const { visibility, setLooking } = useCrewVisibilityState(session?.user?.id ?? null);
  const event = route.params.event;
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [goingCount, setGoingCount] = useState<number>(0);
  const [crewCountBase, setCrewCountBase] = useState<number>(0);
  const [crewRooms, setCrewRooms] = useState<EventCrewRoom[]>([]);
  const [isLoadingCrewRooms, setIsLoadingCrewRooms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCrewPrompt, setShowCrewPrompt] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoadingCounts(true);
      setError(null);
      try {
        const [metrics] = await Promise.all([
          listEventAudienceMetrics([event.id]),
          refreshRsvps()
        ]);
        if (!active) return;
        const eventMetrics = metrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
        setGoingCount(eventMetrics.goingCount);
        setCrewCountBase(eventMetrics.lookingForCrewCount);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load event details.");
      } finally {
        if (active) setIsLoadingCounts(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [event.id, refreshRsvps]);

  useEffect(() => {
    let active = true;

    async function loadCrewRooms() {
      setIsLoadingCrewRooms(true);
      const rooms = await listEventCrewRooms(event.id, session?.user?.id ?? null);
      if (active) {
        setCrewRooms(rooms);
        setIsLoadingCrewRooms(false);
      }
    }

    void loadCrewRooms();
    return () => {
      active = false;
    };
  }, [event.id, session?.user?.id]);

  const rsvpStatus = rsvps[event.id] ?? null;
  const lookingForCrew = rsvpStatus === "going" ? Boolean(visibility[event.id]) : false;

  const eventGenres = (event.genreTags ?? []).filter((g) => g.trim());
  const crewCount = crewCountBase;
  const palette = useMemo(() => getEventPosterPalette(event), [event]);
  const heroDate = useMemo(() => formatEventDateLong(event.startsAt), [event.startsAt]);
  const heroMeta = `${event.venueName || "Venue TBA"} • ${getEventLocationSummary(event)}`;
  const locationInfo = useMemo(() => getEventLocationInfo(event), [event]);
  const eventDescription = useMemo(() => getEventDescription(event), [event]);
  const activitySupportText = useMemo(() => {
    if (isLoadingCounts) return null;
    if (goingCount === 0 && crewCount === 0) {
      return "No one's going yet. Be the first to bring people together.";
    }
    if (crewCount === 0) {
      return "No crew yet. Start the first one.";
    }
    return null;
  }, [crewCount, goingCount, isLoadingCounts]);

  function handleClose() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    const parentNav = navigation.getParent();
    if (parentNav?.canGoBack()) {
      parentNav.goBack();
      return;
    }
    navigation.navigate("DiscoverHome");
  }

  async function handleGoingPress() {
    const nextStatus: RSVPStatus = rsvpStatus === "going" ? "none" : "going";

    if (rsvpStatus === "going" && session?.user?.id) {
      const inCrewChat = await hasEventCrewChat(session.user.id, event.id);
      const message = inCrewChat
        ? "You’ll exit this event and be removed from your crew chat."
        : "You’ll be removed from crew matching for this event.";

      Alert.alert("Leave Event?", message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave Event",
          style: "destructive",
          onPress: () => {
            void persistRsvpChange(nextStatus);
          }
        }
      ]);
      return;
    }

    await persistRsvpChange(nextStatus);
  }

  async function persistRsvpChange(nextStatus: RSVPStatus) {
    if (session?.user?.id) {
      try {
        setIsSaving(true);
        setError(null);
        const previousStatus = rsvpStatus;
        const result = await setRsvp(event.id, nextStatus);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (nextStatus === "going" && previousStatus !== "going") {
          setShowCrewPrompt(true);
        }
        if (nextStatus !== "going") {
          setShowCrewPrompt(false);
        }
        const metrics = await listEventAudienceMetrics([event.id]);
        const eventMetrics = metrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
        setGoingCount(eventMetrics.goingCount);
        setCrewCountBase(eventMetrics.lookingForCrewCount);
      } catch (error) {
        setError(toUserFacingError(error, "Couldn’t update your RSVP."));
      } finally {
        setIsSaving(false);
      }
    }
  }

  async function handleCreateCrewRoom() {
    if (!session?.user?.id) {
      return;
    }

    setIsSaving(true);
    const result = await startEventCrewThreadSeed(session.user.id, event.id);
    setIsSaving(false);
    if (!result.ok || !result.roomId) {
      setError(result.ok ? "Failed to create crew group." : result.error);
      return;
    }

    const rooms = await listEventCrewRooms(event.id, session.user.id);
    setCrewRooms(rooms);
    navigation.navigate("EventCrewRoom", {
      roomId: result.roomId,
      roomTitle: result.title,
      eventTitle: event.title
    });
  }

  async function handleOpenCrewRoom(room: EventCrewRoom) {
    if (!session?.user?.id) {
      return;
    }

    if (!room.isMember) {
      const joinResult = await joinEventCrewRoom(room.id, session.user.id);
      if (!joinResult.ok) {
        setError(joinResult.error);
        return;
      }
      const rooms = await listEventCrewRooms(event.id, session.user.id);
      setCrewRooms(rooms);
    }

    navigation.navigate("EventCrewRoom", {
      roomId: room.id,
      roomTitle: room.title,
      eventTitle: event.title
    });
  }

  async function handleCrewPress() {
    if (rsvpStatus !== "going" || !session?.user?.id) {
      return;
    }

    const result = await setLooking(event.id, !lookingForCrew);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowCrewPrompt(false);

    const metrics = await listEventAudienceMetrics([event.id]);
    const eventMetrics = metrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
    setGoingCount(eventMetrics.goingCount);
    setCrewCountBase(eventMetrics.lookingForCrewCount);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 10, 26),
          paddingBottom: Math.max(insets.bottom + 24, 28)
        }
      ]}
    >
      <View style={styles.posterShell}>
        <View style={[styles.posterHero, { backgroundColor: palette.base }]}>
          {event.flyerUrl ? <RemoteImage uri={event.flyerUrl} style={styles.posterFlyerImage} /> : null}
          {event.flyerUrl ? <View style={styles.posterFlyerOverlay} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterGlowA, { backgroundColor: palette.glowA }]} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterGlowB, { backgroundColor: palette.glowB }]} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterBeamA, { backgroundColor: palette.lineA }]} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterBeamB, { backgroundColor: palette.lineB }]} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterBeamC, { backgroundColor: palette.lineC }]} /> : null}
          {!event.flyerUrl ? <View style={styles.posterGrid} /> : null}

          <View style={styles.posterTopRow}>
            <View style={styles.posterTopLeft}>
              <Pressable style={styles.posterBackButton} onPress={handleClose} hitSlop={12}>
                <Text style={styles.posterBackButtonText}>‹</Text>
              </Pressable>
              <View style={styles.posterStamp}>
                <Text style={styles.posterStampText}>R4V3 EVENT</Text>
              </View>
            </View>
          </View>

          <View style={styles.posterBottomFade} />

          <View style={styles.posterHeadlineWrap}>
            <Text style={styles.posterDate}>{heroDate}</Text>
            <Text style={styles.posterTitle} numberOfLines={2}>{event.title}</Text>
            <Text style={styles.posterMeta}>{heroMeta}</Text>
            <View style={styles.genreChipRow}>
              {(eventGenres.length > 0 ? eventGenres : ["EDM"]).slice(0, 4).map((genre) => (
                <View key={genre} style={styles.genreChip}>
                  <Text style={styles.genreChipText}>{genre}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.detailPanel}>
          <View style={styles.countGrid}>
            <StatBlock label="Going" value={isLoadingCounts ? "…" : String(goingCount)} />
            <StatBlock label="Looking for Crew" value={isLoadingCounts ? "…" : String(crewCount)} />
          </View>

          {activitySupportText ? <Text style={styles.preCtaSupportText}>{activitySupportText}</Text> : null}

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.goingButton, rsvpStatus === "going" && styles.goingButtonActive]}
              onPress={() => void handleGoingPress()}
              disabled={isSaving}
            >
              <Text style={styles.goingButtonText}>
                {isSaving ? "Saving..." : rsvpStatus === "going" ? "Going" : "Join Event"}
              </Text>
            </Pressable>
          </View>

          {rsvpStatus === "going" ? (
            <Pressable
              style={[styles.crewToggleButton, lookingForCrew && styles.crewToggleButtonActive]}
              onPress={() => void handleCrewPress()}
            >
              <View style={[styles.crewToggleDot, lookingForCrew && styles.crewToggleDotActive]} />
              <Text style={[styles.crewToggleText, lookingForCrew && styles.crewToggleTextActive]}>
                {lookingForCrew ? "Looking for Crew" : "Find a Crew"}
              </Text>
            </Pressable>
          ) : null}

          {showCrewPrompt ? (
            <View style={styles.softPromptCard}>
              <Text style={styles.softPromptTitle}>You&apos;re going 🎉</Text>
              <Text style={styles.softPromptBody}>Want to meet others going to this event?</Text>
              <View style={styles.softPromptActionRow}>
                <Pressable style={styles.softPromptPrimaryButton} onPress={() => void handleCrewPress()}>
                  <Text style={styles.softPromptPrimaryButtonText}>Find a Crew</Text>
                </Pressable>
                <Pressable style={styles.softPromptSecondaryButton} onPress={() => setShowCrewPrompt(false)}>
                  <Text style={styles.softPromptSecondaryButtonText}>Not now</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Event Info</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Venue" value={event.venueName || "TBA"} />
          <InfoRow label={locationInfo.label} value={locationInfo.value} />
          <InfoRow label="Date" value={heroDate} />
          <InfoRow label="Source" value={formatSourceLabel(event.sourcePrimary)} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About this event</Text>
        <View style={styles.musicPanel}>
          <Text style={styles.musicPanelBody}>{eventDescription}</Text>
        </View>
      </View>

      {rsvpStatus === "going" ? (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Crew Groups</Text>
            <Pressable style={styles.sectionActionButton} onPress={() => void handleCreateCrewRoom()} disabled={!session?.user?.id || isSaving}>
              <Text style={styles.sectionActionButtonText}>{isSaving ? "Creating..." : "Create Group"}</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionSupportText}>Create smaller group chats for solo ravers or existing friend groups going together.</Text>
          <View style={styles.infoCard}>
            {isLoadingCrewRooms ? <Text style={styles.cardStateText}>Loading groups...</Text> : null}
            {!isLoadingCrewRooms && crewRooms.length === 0 ? <Text style={styles.cardStateText}>No crew groups yet. Start the first one.</Text> : null}
            {crewRooms.map((room, index) => (
              <Pressable key={room.id} style={[styles.crewRoomRow, index === crewRooms.length - 1 && styles.crewRoomRowLast]} onPress={() => void handleOpenCrewRoom(room)}>
                <View style={styles.crewRoomTextBlock}>
                  <Text style={styles.crewRoomTitle}>{room.title}</Text>
                  <Text style={styles.crewRoomMeta}>{room.memberCount}/{room.sizeCap} members • {room.isMember ? "Joined" : "Tap to join"}</Text>
                </View>
                <Text style={styles.crewRoomChevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {isLoadingCounts ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading event activity...</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function StatBlock(props: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statBlockValue}>{props.value}</Text>
      <Text style={styles.statBlockLabel}>{props.label}</Text>
    </View>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowLabel}>{props.label}</Text>
      <Text style={styles.infoRowValue}>{props.value}</Text>
    </View>
  );
}

function formatEventDateLong(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return startsAt;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getEventPosterPalette(event: EventRecord) {
  const seed = `${event.title}-${(event.genreTags ?? []).join("-")}`.toLowerCase();
  if (seed.includes("bass") || seed.includes("dub")) {
    return {
      base: "#17112B",
      glowA: "rgba(125,107,255,0.35)",
      glowB: "rgba(216,119,255,0.25)",
      lineA: "rgba(216,119,255,0.55)",
      lineB: "rgba(125,107,255,0.5)",
      lineC: "rgba(255,176,123,0.26)"
    };
  }
  if (seed.includes("techno")) {
    return {
      base: "#1A1218",
      glowA: "rgba(227,108,63,0.28)",
      glowB: "rgba(255,107,107,0.22)",
      lineA: "rgba(255,107,107,0.5)",
      lineB: "rgba(227,108,63,0.42)",
      lineC: "rgba(255,208,188,0.22)"
    };
  }
  if (seed.includes("house")) {
    return {
      base: "#1C130E",
      glowA: "rgba(227,108,63,0.28)",
      glowB: "rgba(255,176,123,0.22)",
      lineA: "rgba(255,176,123,0.5)",
      lineB: "rgba(216,119,255,0.46)",
      lineC: "rgba(255,208,188,0.24)"
    };
  }
  return {
    base: "#141821",
    glowA: "rgba(106,182,255,0.25)",
    glowB: "rgba(227,108,63,0.16)",
    lineA: "rgba(106,182,255,0.5)",
    lineB: "rgba(216,119,255,0.4)",
    lineC: "rgba(255,208,188,0.22)"
  };
}

function getEventDescription(event: EventRecord) {
  const directDescription = event.description?.trim();
  if (directDescription) {
    return clampDescription(directDescription);
  }

  const curatedDescription = event.curationNote?.trim();
  if (curatedDescription) {
    return clampDescription(curatedDescription);
  }

  const genres = (event.genreTags ?? []).filter(Boolean);
  if (genres.length > 0) {
    return `A ${genres.slice(0, 3).join(", ")} event at ${event.venueName || "a venue to be announced"}. More details will be shared closer to the event.`;
  }

  return "More details about this event will be shared closer to the event date.";
}

function clampDescription(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 280 ? `${compact.slice(0, 277).trimEnd()}...` : compact;
}

function formatSourceLabel(source: EventRecord["sourcePrimary"]) {
  if (source === "ticketmaster") return "Ticketmaster";
  if (source === "posh") return "POSH";
  if (source === "dice") return "DICE";
  if (source === "manual") return "R4V3";
  return source.toUpperCase();
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#0F0D0A"
  },
  container: {
    padding: 16,
    gap: 14,
    backgroundColor: "#0F0D0A"
  },
  posterShell: {
    gap: 0,
    marginTop: -4
  },
  posterHero: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    minHeight: 340,
    overflow: "hidden",
    padding: 14
  },
  posterFlyerImage: {
    ...StyleSheet.absoluteFillObject
  },
  posterFlyerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.34)"
  },
  posterGrid: {
    position: "absolute",
    inset: 0,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.02)"
  },
  posterGlowA: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 999,
    left: -36,
    top: 32
  },
  posterGlowB: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    right: -28,
    top: 96
  },
  posterBeamA: {
    position: "absolute",
    left: -24,
    right: -24,
    top: 124,
    height: 4,
    transform: [{ rotate: "-8deg" }]
  },
  posterBeamB: {
    position: "absolute",
    left: -24,
    right: -24,
    top: 142,
    height: 3,
    transform: [{ rotate: "6deg" }]
  },
  posterBeamC: {
    position: "absolute",
    left: -24,
    right: -24,
    top: 165,
    height: 2,
    transform: [{ rotate: "-3deg" }]
  },
  posterTopRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center"
  },
  posterTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  posterBackButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2
  },
  posterBackButtonText: {
    color: "#FFF8EE",
    fontSize: 30,
    lineHeight: 30,
    marginTop: -2
  },
  posterStamp: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,13,10,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  posterStampText: {
    color: "#FFF8EE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6
  },
  posterCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,8,8,0.45)",
    alignItems: "center",
    justifyContent: "center"
  },
  posterCloseButtonText: {
    color: "#FFF8EE",
    fontSize: 24,
    lineHeight: 24,
    marginTop: -1
  },
  posterBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
    backgroundColor: "rgba(0,0,0,0.42)"
  },
  posterHeadlineWrap: {
    marginTop: "auto",
    gap: 6
  },
  posterDate: {
    color: "#F2E300",
    fontSize: 14,
    fontWeight: "800"
  },
  posterDateSupport: {
    color: "rgba(255,249,239,0.74)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    maxWidth: 280
  },
  posterTitle: {
    color: "#FFF8EE",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900"
  },
  posterMeta: {
    color: "rgba(255,249,239,0.78)",
    fontSize: 14,
    fontWeight: "600"
  },
  genreChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2
  },
  genreChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  genreChipText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700"
  },
  detailPanel: {
    marginTop: 10,
    marginHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(20,17,13,0.8)",
    padding: 12,
    gap: 10
  },
  countGrid: {
    flexDirection: "row",
    gap: 12
  },
  statBlock: {
    flex: 1,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 3
  },
  statBlockValue: {
    color: "#FFF8EE",
    fontSize: 20,
    fontWeight: "800"
  },
  statBlockLabel: {
    color: "rgba(255,249,239,0.66)",
    fontSize: 11,
    fontWeight: "700"
  },
  preCtaSupportText: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 2
  },
  goingButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.34)",
    backgroundColor: "rgba(211,92,51,0.14)",
    alignItems: "center",
    justifyContent: "center"
  },
  goingButtonActive: {
    backgroundColor: "#D65B2C",
    borderColor: "#D65B2C"
  },
  goingButtonText: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  crewToggleButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10
  },
  crewToggleButtonActive: {
    borderColor: "rgba(211,92,51,0.34)",
    backgroundColor: "rgba(211,92,51,0.12)"
  },
  crewToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)"
  },
  crewToggleDotActive: {
    backgroundColor: "#D65B2C"
  },
  crewToggleText: {
    color: "rgba(255,249,239,0.82)",
    fontSize: 13,
    fontWeight: "700"
  },
  crewToggleTextActive: {
    color: "#FFF8EE"
  },
  softPromptCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.2)",
    backgroundColor: "rgba(211,92,51,0.08)",
    padding: 12,
    gap: 10
  },
  softPromptTitle: {
    color: "#FFF8EE",
    fontSize: 15,
    fontWeight: "800"
  },
  softPromptBody: {
    color: "rgba(255,249,239,0.78)",
    fontSize: 13,
    lineHeight: 18
  },
  softPromptActionRow: {
    flexDirection: "row",
    gap: 8
  },
  softPromptPrimaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#D65B2C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  softPromptPrimaryButtonText: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "800"
  },
  softPromptSecondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  softPromptSecondaryButtonText: {
    color: "rgba(255,249,239,0.82)",
    fontSize: 13,
    fontWeight: "700"
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  section: {
    gap: 8
  },
  sectionTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  sectionActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.26)",
    backgroundColor: "rgba(211,92,51,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  sectionActionButtonText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800"
  },
  sectionSupportText: {
    color: "rgba(255,249,239,0.66)",
    fontSize: 12,
    lineHeight: 18
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    overflow: "hidden"
  },
  cardStateText: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 14
  },
  crewRoomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)"
  },
  crewRoomRowLast: {
    borderBottomWidth: 0
  },
  crewRoomTextBlock: {
    flex: 1,
    gap: 2
  },
  crewRoomTitle: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "800"
  },
  crewRoomMeta: {
    color: "rgba(255,249,239,0.64)",
    fontSize: 11,
    fontWeight: "600"
  },
  crewRoomChevron: {
    color: "rgba(255,249,239,0.56)",
    fontSize: 18,
    fontWeight: "700"
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)"
  },
  infoRowLabel: {
    color: "rgba(255,249,239,0.64)",
    fontSize: 12
  },
  infoRowValue: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700",
    maxWidth: "62%",
    textAlign: "right"
  },
  musicPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 12,
    gap: 8
  },
  musicPanelTitle: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  musicPanelBody: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 12,
    lineHeight: 18
  },
  musicTagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  musicTag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  musicTagText: {
    color: "rgba(255,249,239,0.86)",
    fontSize: 11,
    fontWeight: "700"
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 2
  },
  loadingText: {
    color: theme.colors.textSecondary
  }
});
