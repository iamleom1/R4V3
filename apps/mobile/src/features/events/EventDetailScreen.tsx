import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppState } from "../../app/AppProvider";
import { RemoteImage } from "../../components/RemoteImage";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";
import type { EventRecord, RSVPStatus } from "../../types/domain";
import {
  getEventSourceUrl,
  hasEventCrewChat,
  listEventAttendeePreview,
  listEventAudienceMetrics
} from "./eventRepository";
import type { EventAttendeePreview } from "./eventRepository";
import type { DiscoverStackParamList } from "./DiscoverNavigator";
import { getEventLocationInfo } from "./eventLocation";
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
  const [error, setError] = useState<string | null>(null);
  const [showCrewPrompt, setShowCrewPrompt] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [attendeePreview, setAttendeePreview] = useState<EventAttendeePreview[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoadingCounts(true);
      setError(null);
      try {
        const [metrics, preview] = await Promise.all([
          listEventAudienceMetrics([event.id]),
          listEventAttendeePreview(event.id, 12),
          refreshRsvps()
        ]);
        if (!active) return;
        const eventMetrics = metrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
        setGoingCount(eventMetrics.goingCount);
        setCrewCountBase(eventMetrics.lookingForCrewCount);
        setAttendeePreview(preview);
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

    async function loadSourceUrl() {
      const resolved = await getEventSourceUrl(event);
      if (active) {
        setSourceUrl(resolved);
      }
    }

    void loadSourceUrl();
    return () => {
      active = false;
    };
  }, [event]);

  const rsvpStatus = rsvps[event.id] ?? null;
  const lookingForCrew = rsvpStatus === "going" ? Boolean(visibility[event.id]) : false;

  const eventGenres = (event.genreTags ?? []).filter((g) => g.trim());
  const crewCount = crewCountBase;
  const palette = useMemo(() => getEventPosterPalette(event), [event]);
  const heroDateShort = useMemo(() => formatEventDateShort(event.startsAt), [event.startsAt]);
  const heroDateLong = useMemo(() => formatEventDateLong(event.startsAt), [event.startsAt]);
  const locationInfo = useMemo(() => getEventLocationInfo(event), [event]);
  const goingPreview = useMemo(
    () => attendeePreview.filter((attendee) => attendee.rsvpStatus === "going"),
    [attendeePreview]
  );
  const crewPreview = useMemo(
    () => attendeePreview.filter((attendee) => attendee.lookingForCrew),
    [attendeePreview]
  );
  const displayGenres = useMemo(() => (eventGenres.length > 0 ? eventGenres : ["EDM"]).slice(0, 2), [eventGenres]);
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
        const [metrics, preview] = await Promise.all([
          listEventAudienceMetrics([event.id]),
          listEventAttendeePreview(event.id, 12)
        ]);
        const eventMetrics = metrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
        setGoingCount(eventMetrics.goingCount);
        setCrewCountBase(eventMetrics.lookingForCrewCount);
        setAttendeePreview(preview);
      } catch (error) {
        setError(toUserFacingError(error, "Couldn’t update your RSVP."));
      } finally {
        setIsSaving(false);
      }
    }
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

    const [metrics, preview] = await Promise.all([
      listEventAudienceMetrics([event.id]),
      listEventAttendeePreview(event.id, 12)
    ]);
    const eventMetrics = metrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
    setGoingCount(eventMetrics.goingCount);
    setCrewCountBase(eventMetrics.lookingForCrewCount);
    setAttendeePreview(preview);
  }

  async function handleSourcePress() {
    if (!sourceUrl) {
      return;
    }

    try {
      const supported = await Linking.canOpenURL(sourceUrl);
      if (!supported) {
        Alert.alert("Link unavailable", "This event source can’t be opened on this device.");
        return;
      }
      await Linking.openURL(sourceUrl);
    } catch {
      Alert.alert("Link unavailable", "Couldn’t open the ticket source right now.");
    }
  }

  async function handleSharePress() {
    try {
      const venue = event.venueName?.trim() || "TBA";
      const city = event.city?.trim() || "TBA";
      const message = [
        `Check out this event on R4V3: ${event.title}`,
        heroDateLong,
        `${venue} • ${city}`,
        sourceUrl ?? "Open R4V3 to see the full event details."
      ].join("\n");

      await Share.share({ message });
    } catch {
      Alert.alert("Share unavailable", "Couldn’t open the share sheet right now.");
    }
  }

  return (
    <View style={styles.screen}>
      <Pressable
        style={[styles.floatingBackButton, { top: Math.max(insets.top + 8, 20) }]}
        onPress={handleClose}
        hitSlop={12}
      >
        <Text style={styles.posterBackButtonText}>‹</Text>
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: 0,
            paddingBottom: Math.max(insets.bottom + 104, 112)
          }
        ]}
      >
        <View style={styles.heroShell}>
          <View
            style={[
              styles.posterHero,
              {
                backgroundColor: palette.base,
                paddingTop: Math.max(insets.top + 16, 32)
              }
            ]}
          >
          {event.flyerUrl ? <RemoteImage uri={event.flyerUrl} style={styles.posterFlyerImage} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterGlowA, { backgroundColor: palette.glowA }]} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterGlowB, { backgroundColor: palette.glowB }]} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterBeamA, { backgroundColor: palette.lineA }]} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterBeamB, { backgroundColor: palette.lineB }]} /> : null}
          {!event.flyerUrl ? <View style={[styles.posterBeamC, { backgroundColor: palette.lineC }]} /> : null}
          {!event.flyerUrl ? <View style={styles.posterGrid} /> : null}

          <LinearGradient
            colors={[
              "rgba(0,0,0,0)",
              "rgba(0,0,0,0.14)",
              "rgba(0,0,0,0.38)",
              "rgba(0,0,0,0.68)",
              "rgba(0,0,0,0.86)",
              "rgba(0,0,0,0.96)"
            ]}
            locations={[0, 0.1, 0.35, 0.58, 0.8, 1]}
            style={styles.posterBottomOverlay}
          >
            <Text style={styles.posterDate}>{heroDateShort}</Text>
            <Text style={styles.posterTitle} numberOfLines={3}>{event.title}</Text>
            <View style={styles.genreChipRow}>
              {displayGenres.map((genre) => (
                <View key={genre} style={styles.genreChip}>
                  <Text style={styles.genreChipText}>{genre}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

          <View style={styles.detailPanel}>
            <View style={styles.countGrid}>
            <View style={styles.statColumn}>
                <StatBlock label="Going" value={isLoadingCounts ? "…" : String(goingCount)} />
              <AvatarPile attendees={goingPreview} totalCount={goingCount} tone="warm" />
            </View>
            <View style={styles.statColumn}>
              <StatBlock label="Looking for Crew" value={isLoadingCounts ? "…" : String(crewCount)} />
              <AvatarPile attendees={crewPreview} totalCount={crewCount} tone="cool" />
            </View>
          </View>

          {activitySupportText ? <Text style={styles.preCtaSupportText}>{activitySupportText}</Text> : null}

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.goingButton, rsvpStatus === "going" && styles.goingButtonActive]}
              onPress={() => void handleGoingPress()}
              disabled={isSaving}
            >
              <Text style={styles.goingButtonText}>
                {isSaving ? "Saving..." : rsvpStatus === "going" ? "Leave Event" : "I'm Going"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.crewToggleButton, lookingForCrew && styles.crewToggleButtonActive]}
              onPress={() => void handleCrewPress()}
              disabled={rsvpStatus !== "going" || isSaving}
            >
              <Text style={[styles.crewToggleText, lookingForCrew && styles.crewToggleTextActive]}>
                {lookingForCrew ? "Looking for Crew" : "Find Crew"}
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.shareButton} onPress={() => void handleSharePress()}>
            <Text style={styles.shareButtonIcon}>↗</Text>
            <View style={styles.shareButtonBody}>
              <Text style={styles.shareButtonTitle}>Share Event</Text>
              <Text style={styles.shareButtonText}>Send this event to someone else to check out.</Text>
            </View>
            <Text style={styles.shareButtonCaret}>›</Text>
          </Pressable>

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
            <InfoRow icon="📍" label="Venue" value={event.venueName || "TBA"} />
            <InfoRow icon="⌖" label={locationInfo.label} value={locationInfo.value} />
            <InfoRow icon="📅" label="Date" value={heroDateLong} />
            <InfoRow
              icon="↗"
              label="Source"
              value={formatSourceLabel(event.sourcePrimary)}
              onPress={sourceUrl ? () => void handleSourcePress() : undefined}
            />
          </View>
        </View>

        {isLoadingCounts ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading event activity...</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
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

function AvatarPile(props: { attendees: EventAttendeePreview[]; totalCount: number; tone: "warm" | "cool" }) {
  if (props.totalCount <= 0) {
    return <Text style={styles.avatarPileEmpty}>No one yet</Text>;
  }

  const palette = props.tone === "warm"
    ? ["#6A4B38", "#A56A4A", "#D8A47A", "#3B2A23"]
    : ["#37536A", "#4E7DA5", "#A8C0D8", "#26313D"];
  const visibleAttendees = props.attendees.slice(0, 3);
  const visibleCount = visibleAttendees.length;
  const extra = Math.max(props.totalCount - visibleCount, 0);

  return (
    <View style={styles.avatarPile}>
      {visibleAttendees.map((attendee, index) => (
        <View
          key={attendee.profileId}
          style={[
            styles.avatarBubble,
            { backgroundColor: palette[index % palette.length], marginLeft: index === 0 ? 0 : -12, zIndex: visibleCount - index }
          ]}
        >
          {attendee.profilePhotoUrl ? <RemoteImage uri={attendee.profilePhotoUrl} style={styles.avatarBubbleImage} /> : null}
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.avatarBubble, styles.avatarBubbleExtra, { marginLeft: -12 }]}>
          <Text style={styles.avatarBubbleExtraText}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

function InfoRow(props: { icon: string; label: string; value: string; onPress?: (() => void) | undefined }) {
  const content = (
    <>
      <View style={styles.infoRowLead}>
        <Text style={styles.infoRowIcon}>{props.icon}</Text>
        <Text style={styles.infoRowLabel}>{props.label}</Text>
      </View>
      <View style={styles.infoRowAction}>
        <Text style={[styles.infoRowValue, props.onPress && styles.infoRowValueLink]} numberOfLines={2}>
          {props.value}
        </Text>
      </View>
    </>
  );

  if (props.onPress) {
    return (
      <Pressable style={styles.infoRow} onPress={props.onPress}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.infoRow}>
      {content}
    </View>
  );
}

function formatEventDateShort(startsAt: string) {
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

function formatSourceLabel(source: EventRecord["sourcePrimary"]) {
  if (source === "ticketmaster") return "Ticketmaster";
  if (source === "posh") return "POSH";
  if (source === "dice") return "DICE";
  if (source === "manual") return "R4V3";
  return source.toUpperCase();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000000"
  },
  scroll: {
    flex: 1,
    backgroundColor: "#000000"
  },
  container: {
    paddingBottom: 28,
    backgroundColor: "#000000"
  },
  heroShell: {
    gap: 0,
    marginTop: 0
  },
  posterHero: {
    minHeight: 560,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
    justifyContent: "space-between"
  },
  posterFlyerImage: {
    ...StyleSheet.absoluteFillObject
  },
  posterGrid: {
    position: "absolute",
    inset: 0,
    borderWidth: 0
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
  floatingBackButton: {
    position: "absolute",
    left: 12,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10
  },
  posterBackButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    marginRight: 6
  },
  posterBackButtonText: {
    color: "#FFF8EE",
    fontSize: 28,
    lineHeight: 28,
    marginTop: -1
  },
  posterBottomOverlay: {
    marginTop: "auto",
    marginHorizontal: -16,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 38,
    gap: 8,
    zIndex: 3
  },
  posterDate: {
    color: "#F2E300",
    fontSize: 16,
    fontWeight: "800"
  },
  posterTitle: {
    color: "#FFF8EE",
    fontSize: 27,
    lineHeight: 29,
    fontWeight: "900"
  },
  genreChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 0
  },
  genreChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(12,12,12,0.54)",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  genreChipText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700"
  },
  detailPanel: {
    marginTop: -10,
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(16,16,16,0.98)",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
    zIndex: 4,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  countGrid: {
    flexDirection: "row",
    gap: 12
  },
  statColumn: {
    flex: 1,
    gap: 6
  },
  statBlock: {
    flex: 1,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 3
  },
  statBlockValue: {
    color: "#FFF8EE",
    fontSize: 28,
    fontWeight: "800"
  },
  statBlockLabel: {
    color: "rgba(255,249,239,0.66)",
    fontSize: 10,
    fontWeight: "500"
  },
  avatarPile: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34
  },
  avatarBubble: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(14,14,14,0.98)",
    overflow: "hidden"
  },
  avatarBubbleImage: {
    width: "100%",
    height: "100%"
  },
  avatarBubbleExtra: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2D2F34"
  },
  avatarBubbleExtraText: {
    color: "#FFF8EE",
    fontSize: 10,
    fontWeight: "800"
  },
  avatarPileEmpty: {
    color: "rgba(255,249,239,0.48)",
    fontSize: 9,
    fontWeight: "600"
  },
  preCtaSupportText: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 0
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2
  },
  goingButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(62,83,144,0.40)",
    backgroundColor: "rgba(12,15,28,0.98)",
    alignItems: "center",
    justifyContent: "center"
  },
  goingButtonActive: {
    backgroundColor: "rgba(18,24,40,1)",
    borderColor: "rgba(105,132,219,0.48)"
  },
  goingButtonText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800"
  },
  crewToggleButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(181,88,45,0.42)",
    backgroundColor: "rgba(24,13,8,0.98)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  crewToggleButtonActive: {
    borderColor: "#D65B2C",
    backgroundColor: "rgba(211,92,51,0.18)"
  },
  crewToggleText: {
    color: "#D97849",
    fontSize: 12,
    fontWeight: "700"
  },
  crewToggleTextActive: {
    color: "#FF9E6E"
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    marginTop: 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(12,12,14,0.98)",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  shareButtonIcon: {
    width: 24,
    color: "#FFB07B",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center"
  },
  shareButtonBody: {
    flex: 1,
    gap: 2
  },
  shareButtonTitle: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "800"
  },
  shareButtonText: {
    color: "rgba(255,249,239,0.56)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600"
  },
  shareButtonCaret: {
    color: "rgba(255,249,239,0.38)",
    fontSize: 20,
    lineHeight: 20,
    fontWeight: "700"
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
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  sectionTitle: {
    color: "#FFF8EE",
    fontSize: 15,
    fontWeight: "800"
  },
  infoCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.025)",
    overflow: "hidden"
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)"
  },
  infoRowLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1
  },
  infoRowIcon: {
    color: "#FF6A2A",
    fontSize: 17,
    width: 18,
    textAlign: "center"
  },
  infoRowLabel: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 12,
    fontWeight: "500"
  },
  infoRowAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 1,
    maxWidth: "64%"
  },
  infoRowValue: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800",
    maxWidth: "100%",
    textAlign: "right"
  },
  infoRowValueLink: {
    maxWidth: "100%"
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
