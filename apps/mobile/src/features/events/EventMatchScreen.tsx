import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppState } from "../../app/AppProvider";
import { RemoteImage } from "../../components/RemoteImage";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";
import { expandInterestedGendersForMatching } from "../profile/genderOptions";
import type { EventRecord } from "../../types/domain";
import { createSwipeDecision } from "../matches/matchRepository";
import {
  listEventCandidatePreview,
  listMyEventRsvps,
  startEventCrewThreadSeed,
  type EventCandidatePreview
} from "./eventRepository";
import type { DiscoverStackParamList } from "./DiscoverNavigator";
import { getEventLocationSummary } from "./eventLocation";

type Props = NativeStackScreenProps<DiscoverStackParamList, "EventMatch">;

type EventSwipeCandidate = EventCandidatePreview & { event: EventRecord };

const SWIPE_THRESHOLD = 105;
const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

export function EventMatchScreen({ route, navigation }: Props) {
  const { session, profileDraft } = useAppState();
  const event = route.params.event;
  const [candidates, setCandidates] = useState<EventSwipeCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hint, setHint] = useState<"like" | "pass" | null>(null);
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [notifyOnActivity, setNotifyOnActivity] = useState(false);
  const swipe = useRef(new Animated.ValueXY()).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const lockRef = useRef(false);
  const preferredCandidates = useMemo(
    () => candidates.filter((candidate) => candidateMatchesProfilePreferences(candidate, profileDraft)),
    [candidates, profileDraft]
  );
  const isUsingPreferenceFallback = candidates.length > 0 && preferredCandidates.length === 0;
  const activeCandidates = isUsingPreferenceFallback ? candidates : preferredCandidates;
  const current = activeCandidates[index] ?? null;
  const ghost = useMemo(() => activeCandidates.slice(index + 1, index + 3), [activeCandidates, index]);
  const stackHeight = Math.max(410, Math.min(570, SCREEN_HEIGHT - 270));
  const photoStageHeight = Math.max(260, Math.min(470, stackHeight - 84));
  const eventGenreLabel = useMemo(() => compactGenreLabel(event.genreTags?.[0] ?? null), [event.genreTags]);
  const currentDistance = typeof current?.distanceKm === "number" && Number.isFinite(current.distanceKm)
    ? `${Math.max(1, Math.round(current.distanceKm * 0.621371))} miles away`
    : "This event";

  if (Platform.OS === "android" && (UIManager as any).setLayoutAnimationEnabledExperimental) {
    (UIManager as any).setLayoutAnimationEnabledExperimental(true);
  }

  const loadDiscovery = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (!session?.user?.id) {
        setCandidates([]);
        setIndex(0);
        return;
      }

      const myRsvps = await listMyEventRsvps(session.user.id);
      if (myRsvps[event.id] !== "going") {
        setCandidates([]);
        setIndex(0);
        setError("Join this event to unlock matching.");
        return;
      }

      const rows = await listEventCandidatePreview(event.id, session.user.id, 20);
      setCandidates(rows.map((r) => ({ ...r, event })));
      setIndex(0);
    } catch (error) {
      setCandidates([]);
      setIndex(0);
      setError(toUserFacingError(error, "Couldn’t load event matching right now."));
    } finally {
      setIsLoading(false);
    }
  }, [event, session?.user?.id]);

  useEffect(() => {
    void loadDiscovery();
  }, [loadDiscovery]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    swipe.setValue({ x: 0, y: 0 });
    setHint(null);
    setIsProfileExpanded(false);
    lockRef.current = false;
  }, [current?.profileId, swipe]);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [isProfileExpanded]);

  async function commit(decision: "like" | "pass") {
    if (!current || lockRef.current) return;
    lockRef.current = true;

    if (current.softCandidate && decision === "like") {
      setNotice("Crew invite sent. It activates once both people enable crew matching.");
    }

    if (session?.user?.id && !current.softCandidate) {
      setIsSubmitting(true);
      const result = await createSwipeDecision({
        actorProfileId: session.user.id,
        targetProfileId: current.profileId,
        eventId: event.id,
        mode: "community",
        decision
      });
      setIsSubmitting(false);
      if (!result.ok) {
        setError(result.error);
        lockRef.current = false;
        return;
      }
    }

    setIndex((n) => n + 1);
  }

  async function handleStartCrew() {
    if (!session?.user?.id) {
      const rootNav: any = navigation.getParent()?.getParent();
      rootNav?.navigate?.("Auth", { intent: "crew_chat", authPrompt: "Sign in to start the first crew for this event." });
      return;
    }
    setIsSubmitting(true);
    const result = await startEventCrewThreadSeed(session.user.id, event.id);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice("Crew started. Others can join as they RSVP.");
    await loadDiscovery();
  }

  function resetCard() {
    Animated.spring(swipe, { toValue: { x: 0, y: 0 }, useNativeDriver: false, bounciness: 8 }).start(() => {
      setHint(null);
    });
  }

  function swipeOut(decision: "like" | "pass") {
    if (isSubmitting || !current || lockRef.current) return;
    lockRef.current = true;
    Animated.timing(swipe, {
      toValue: { x: decision === "like" ? SCREEN_WIDTH * 1.2 : -SCREEN_WIDTH * 1.2, y: 0 },
      duration: 180,
      useNativeDriver: false
    }).start(async ({ finished }) => {
      if (!finished) {
        lockRef.current = false;
        return;
      }
      await commit(decision);
      swipe.setValue({ x: 0, y: 0 });
      setHint(null);
    });
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_e, g) => {
          if (!current || isSubmitting || lockRef.current) return;
          swipe.setValue({ x: g.dx, y: g.dy * 0.12 });
          setHint(g.dx > 35 ? "like" : g.dx < -35 ? "pass" : null);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dx > SWIPE_THRESHOLD) return swipeOut("like");
          if (g.dx < -SWIPE_THRESHOLD) return swipeOut("pass");
          resetCard();
        },
        onPanResponderTerminate: resetCard
      }),
    [current, isSubmitting]
  );

  const cardStyle = {
    transform: [
      { translateX: swipe.x },
      { translateY: swipe.y },
      {
        rotate: swipe.x.interpolate({
          inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
          outputRange: ["-9deg", "0deg", "9deg"]
        })
      }
    ]
  } as const;

  const likeBadgeOpacity = swipe.x.interpolate({
    inputRange: [0, 40, SWIPE_THRESHOLD],
    outputRange: [0, 0.35, 1],
    extrapolate: "clamp"
  });

  const passBadgeOpacity = swipe.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -40, 0],
    outputRange: [1, 0.35, 0],
    extrapolate: "clamp"
  });

  const ghostShift = swipe.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: [-6, 0, 6],
    extrapolate: "clamp"
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.eventContextCard}>
        <View style={styles.eventContextIcon}>
          <Text style={styles.eventContextIconText}>♪</Text>
        </View>
        <View style={styles.eventContextCopy}>
          <Text style={styles.eventContextEyebrow}>Event Matching</Text>
          <Text style={styles.eventContextTitle}>{event.title}</Text>
          <Text style={styles.eventContextSubtitle}>{getEventLocationSummary(event)}</Text>
        </View>
      </View>

      <View style={styles.stackShell}>
        {isUsingPreferenceFallback ? (
          <View style={styles.preferenceFallbackBanner}>
            <Text style={styles.preferenceFallbackBannerText}>
              No one here matches your filters right now. Showing everyone currently looking for a crew.
            </Text>
          </View>
        ) : null}
        <View style={[styles.stackArea, { minHeight: stackHeight }]}>
          {isLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.caption}>Loading attendees…</Text>
            </View>
          ) : null}

          {[...ghost].reverse().map((c, i) => (
            <Animated.View
              key={c.profileId}
              style={[
                styles.stackGhostCard,
                {
                  top: 12 + i * 9,
                  bottom: 12 - i * 2,
                  left: 12 + i * 5,
                  right: 12 + i * 5,
                  transform: [{ translateX: Animated.multiply(ghostShift, i + 0.4) }]
                }
              ]}
            />
          ))}

          {current ? (
            <Animated.View
              style={[styles.primaryCard, cardStyle, isProfileExpanded && styles.primaryCardExpanded]}
              {...(isProfileExpanded ? {} : panResponder.panHandlers)}
            >
              <Animated.View style={[styles.swipeBadge, styles.swipeBadgeLeft, { opacity: passBadgeOpacity }]}>
                <Text style={styles.swipeBadgeText}>PASS</Text>
              </Animated.View>
              <Animated.View style={[styles.swipeBadge, styles.swipeBadgeRight, { opacity: likeBadgeOpacity }]}>
                <Text style={styles.swipeBadgeText}>CONNECT</Text>
              </Animated.View>

              <View style={[styles.photoStage, { flex: 1, minHeight: photoStageHeight }]}>
                {current.profilePhotoUrl ? <RemoteImage uri={current.profilePhotoUrl} style={styles.profilePhotoImage} /> : null}
                {!current.profilePhotoUrl ? <View style={styles.photoGlow} /> : null}
                {!current.profilePhotoUrl ? <View style={styles.photoOrb} /> : null}
                {!current.profilePhotoUrl ? <View style={styles.photoNoiseStripe} /> : null}
                {!current.profilePhotoUrl ? <View style={styles.stageBeamLeft} /> : null}
                {!current.profilePhotoUrl ? <View style={styles.stageBeamRight} /> : null}

                <View style={styles.photoOverlay}>
                  <View style={styles.photoTopMeta}>
                    <View style={styles.eventPill}>
                      <Text style={styles.eventPillText}>{eventGenreLabel}</Text>
                    </View>
                    <View style={styles.photoModePill}>
                      <Text style={styles.photoModePillText}>{current.discoveryLabel ?? "Actively matching"}</Text>
                    </View>
                  </View>

                  <View style={styles.photoBottomOverlay}>
                    <View style={styles.collapsedCardMeta}>
                      <View style={styles.collapsedCardMetaMain}>
                        <Text style={styles.photoTitle}>{current.displayName}</Text>
                        <Text style={styles.photoIntentLine}>Interested • Solo</Text>
                        <Text style={styles.photoSubtitle}>{current.city || "City hidden"}</Text>
                        <Text style={styles.photoDistance}>{currentDistance}</Text>
                      </View>
                      <Pressable onPress={() => setIsProfileExpanded((v) => !v)} style={styles.inlineExpandChip}>
                        <Text style={styles.inlineExpandChipText}>{isProfileExpanded ? "Close" : "View Profile ↓"}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>

              {isProfileExpanded ? (
                <View style={styles.expandedInCardBody}>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionLabel}>About</Text>
                    <Text style={styles.modalBodyText}>{current.bio?.trim() || "Add a bio to get more matches"}</Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionLabel}>Meetup info</Text>
                    <View style={styles.cleanFactsList}>
                      <FactLine label="Location" value={current.city ?? "Not shared"} />
                      <FactLine label="Distance" value={currentDistance} />
                      <FactLine label="Crew size preference" value="Solo" />
                    </View>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionLabel}>Showcase</Text>
                    <View style={styles.showcasePill}>
                      <View style={styles.showcaseGroup}>
                        <Text style={styles.showcaseGroupLabel}>Vibe</Text>
                        <View style={styles.showcaseGrid}>
                          {(current.vibeTags.length > 0 ? current.vibeTags : ["Community", "Meetup"]).slice(0, 4).map((tag, idx) => (
                            <EventArtTile key={`${tag}-${idx}`} title={tag} index={idx} />
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              ) : null}

              {hint ? (
                <View style={styles.cardBodySlim}>
                  <Text style={styles.swipeHintText}>{hint === "like" ? "Release to connect" : "Release to pass"}</Text>
                </View>
              ) : null}
              {error ? <Text style={[styles.error, styles.inlineError]}>{error}</Text> : null}
            </Animated.View>
          ) : (
            <View style={styles.emptyCard}>
              <Animated.View
                style={[
                  styles.emptyPulseOrb,
                  { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.56] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }] }
                ]}
              />
              <Text style={styles.emptyStatus}>0 people currently looking for a crew</Text>
              <Text style={styles.emptyTitle}>You&apos;re early.</Text>
              <Text style={styles.caption}>
                Most ravers start looking for crews closer to the event. As more people RSVP, new crew candidates will appear here.
              </Text>
              <Pressable style={[styles.primaryInlineAction, isSubmitting && styles.actionDisabled]} onPress={() => void handleStartCrew()} disabled={isSubmitting}>
                <Text style={styles.primaryInlineActionText}>{isSubmitting ? "Starting..." : "Start the first crew for this event"}</Text>
              </Pressable>
              <View style={styles.emptyToggleRow}>
                <Pressable style={[styles.notifyToggle, notifyOnActivity && styles.notifyToggleOn]} onPress={() => setNotifyOnActivity((v) => !v)}>
                  <View style={[styles.notifyKnob, notifyOnActivity && styles.notifyKnobOn]} />
                </Pressable>
                <Text style={styles.emptyToggleText}>Notify me when people start looking for a crew</Text>
              </View>
              {notifyOnActivity ? (
                <Text style={styles.emptyToggleHelper}>We&apos;ll notify you when new crew candidates appear for this event.</Text>
              ) : null}
              <View style={styles.emptyActionsRow}>
                <Pressable style={styles.emptySecondaryBtn} onPress={() => navigation.navigate("DiscoverHome")}>
                  <Text style={styles.emptySecondaryBtnText}>Explore other events</Text>
                </Pressable>
                <Pressable style={styles.emptyGhostBtn} onPress={() => void loadDiscovery()}>
                  <Text style={styles.emptyGhostBtnText}>Refresh</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>

      {current ? (
        <Text style={styles.contextLabelText}>
          {current.discoveryLabel ?? "Going to the same event"}
        </Text>
      ) : null}

      {!isProfileExpanded ? <View style={styles.actionDock}>
        <Pressable
          style={[styles.dockButton, styles.dockButtonGhost, isSubmitting && styles.actionDisabled]}
          onPress={() => swipeOut("pass")}
          disabled={isSubmitting || !current}
        >
          <Text style={styles.dockButtonGhostText}>✕</Text>
        </Pressable>
        <Pressable style={[styles.dockMiniButton, styles.dockMiniButtonMid]}>
          <View style={styles.dockMiniRadarWrap}>
            <View style={styles.dockMiniRadarRingOuter} />
            <View style={styles.dockMiniRadarRingInner} />
            <View style={styles.dockMiniRadarCore} />
            <View style={styles.dockMiniRadarSweep} />
            <View style={styles.dockMiniRadarBlip} />
          </View>
        </Pressable>
        <Pressable
          style={[styles.dockButton, styles.dockButtonPrimary, !current && styles.dockButtonPrimaryWide, isSubmitting && styles.actionDisabled]}
          onPress={() => (current ? swipeOut("like") : void handleStartCrew())}
          disabled={isSubmitting}
        >
          <Text style={styles.dockButtonPrimaryText}>
            {isSubmitting ? "…" : current ? "❤" : "Start a crew"}
          </Text>
        </Pressable>
      </View> : null}
      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
    </ScrollView>
  );
}

function candidateMatchesProfilePreferences(
  candidate: Pick<EventCandidatePreview, "gender">,
  profileDraft: { interestedGenders: string[] }
) {
  const interested = expandInterestedGendersForMatching(profileDraft.interestedGenders);
  if (interested) {
    const candidateGender = (candidate.gender ?? "").trim().toLowerCase();
    if (!candidateGender) {
      return false;
    }
    if (!interested.has(candidateGender)) {
      return false;
    }
  }

  return true;
}

function FactLine(props: { label: string; value: string }) {
  return (
    <View style={styles.factLine}>
      <Text style={styles.factLineLabel}>{props.label}</Text>
      <Text style={styles.factLineValue} numberOfLines={1}>{props.value}</Text>
    </View>
  );
}

function EventArtTile(props: { title: string; index: number }) {
  return (
    <View style={[styles.showcaseArtTile, eventArtPalette(props.index)]}>
      <View style={styles.eventArtBeam} />
      <View style={styles.eventArtOrb} />
      <View style={styles.showcaseTileFooter}>
        <Text style={styles.showcaseTileTitle} numberOfLines={2}>{props.title}</Text>
      </View>
    </View>
  );
}

function compactGenreLabel(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) {
    return "EVENT";
  }
  const token = raw.replace(/[&/,+]/g, " ").split(/\s+/).filter(Boolean)[0] ?? "Event";
  return token.slice(0, 12).toUpperCase();
}

function eventArtPalette(index: number) {
  const palettes = [
    { backgroundColor: "#2A1E16", borderColor: "rgba(211,92,51,0.24)" },
    { backgroundColor: "#1A2230", borderColor: "rgba(79,134,255,0.24)" },
    { backgroundColor: "#241938", borderColor: "rgba(108,73,255,0.24)" },
    { backgroundColor: "#2A181B", borderColor: "rgba(255,106,77,0.24)" }
  ];
  return palettes[index % palettes.length];
}

function musicArtPalette(index: number) {
  const palettes = [
    { backgroundColor: "#171F18", borderColor: "rgba(107,216,145,0.28)" },
    { backgroundColor: "#1B1E2B", borderColor: "rgba(112,153,255,0.28)" },
    { backgroundColor: "#241A1A", borderColor: "rgba(255,122,106,0.28)" },
    { backgroundColor: "#211C14", borderColor: "rgba(255,196,92,0.28)" }
  ];
  return palettes[index % palettes.length];
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 10, paddingBottom: 24, backgroundColor: theme.colors.canvas },
  eventContextCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  eventContextIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(211,92,51,0.12)",
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.34)",
    alignItems: "center",
    justifyContent: "center"
  },
  eventContextIconText: { fontSize: 22, color: "#FFF8EE", fontWeight: "700" },
  eventContextCopy: { flex: 1, gap: 2 },
  eventContextEyebrow: { color: "rgba(255,249,239,0.62)", ...theme.type.eyebrow, textTransform: "uppercase" },
  eventContextTitle: { color: "#FFF8EE", ...theme.type.titleMd },
  eventContextSubtitle: { color: "rgba(255,249,239,0.68)", ...theme.type.caption },
  caption: { color: "rgba(255,249,239,0.72)", ...theme.type.caption },
  stackShell: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: theme.colors.surface,
    padding: 8,
    marginTop: 2
  },
  preferenceFallbackBanner: {
    paddingHorizontal: 8,
    paddingBottom: 6
  },
  preferenceFallbackBannerText: {
    color: "rgba(255,249,239,0.72)",
    ...theme.type.caption
  },
  stackArea: { flex: 1, position: "relative", paddingTop: 8 },
  loadingBlock: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 8 },
  stackGhostCard: {
    position: "absolute",
    borderRadius: 26,
    backgroundColor: "#2A251D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    opacity: 0.9
  },
  primaryCard: {
    flex: 1,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#201C16",
    overflow: "hidden"
  },
  primaryCardExpanded: {
    flex: 0
  },
  swipeBadge: {
    position: "absolute",
    top: 16,
    zIndex: 2,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  swipeBadgeLeft: {
    left: 16,
    borderColor: "#FF6C6C",
    backgroundColor: "rgba(255,108,108,0.15)"
  },
  swipeBadgeRight: {
    right: 16,
    borderColor: "#7BFF9B",
    backgroundColor: "rgba(123,255,155,0.15)"
  },
  swipeBadgeText: { color: "#FFF8EE", fontWeight: "800", fontSize: 12 },
  photoStage: {
    backgroundColor: "#2A2218",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden"
  },
  profilePhotoImage: {
    ...StyleSheet.absoluteFillObject
  },
  photoGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "#C24A22",
    opacity: 0.22
  },
  photoOrb: {
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "#3B3124",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)"
  },
  photoNoiseStripe: {
    position: "absolute",
    left: -20,
    right: -20,
    top: 74,
    height: 34,
    backgroundColor: "#E4A891",
    opacity: 0.16,
    transform: [{ rotate: "-6deg" }]
  },
  stageBeamLeft: {
    position: "absolute",
    width: 180,
    height: 420,
    left: -40,
    top: -40,
    backgroundColor: "#D06B46",
    opacity: 0.08,
    transform: [{ rotate: "-18deg" }]
  },
  stageBeamRight: {
    position: "absolute",
    width: 180,
    height: 420,
    right: -40,
    top: -30,
    backgroundColor: "#F0B29A",
    opacity: 0.07,
    transform: [{ rotate: "18deg" }]
  },
  photoOverlay: {
    position: "absolute",
    inset: 0,
    padding: 14,
    justifyContent: "space-between"
  },
  photoTopMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  eventPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(17,16,13,0.55)",
    maxWidth: "72%"
  },
  eventPillText: { color: "#FFF8EE", ...theme.type.caption, fontWeight: "700" },
  photoModePill: {
    alignSelf: "flex-end",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(17,16,13,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  photoModePillText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  photoBottomOverlay: {
    gap: 0,
    paddingHorizontal: 14,
    paddingTop: 34,
    paddingBottom: 14,
    marginHorizontal: -14,
    marginBottom: -14,
    backgroundColor: "transparent"
  },
  photoTitle: { color: "#FFF8EE", ...theme.type.titleMd },
  photoSubtitle: { color: "rgba(255,249,239,0.75)", ...theme.type.caption },
  photoDistance: { color: "rgba(255,249,239,0.75)", ...theme.type.caption },
  reason: { color: "#FFC7B2", ...theme.type.caption, fontWeight: "600" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  tagText: { color: "#FFF8EE", ...theme.type.caption, fontWeight: "700" },
  cardBodySlim: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10
  },
  expandedInCardBody: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: "#100E0B"
  },
  collapsedCardMeta: {
    gap: 10
  },
  collapsedCardMetaMain: {
    gap: 4
  },
  photoIntentLine: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 12,
    fontWeight: "700"
  },
  inlineExpandChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  inlineExpandChipText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700"
  },
  bio: { color: "rgba(255,249,239,0.8)", lineHeight: 19 },
  swipeHintText: { color: "rgba(255,249,239,0.72)", fontSize: 11, textAlign: "center" },
  error: { color: "#FF9F9F", fontWeight: "600" },
  inlineError: { paddingHorizontal: 14, paddingBottom: 10 },
  modalSection: { gap: 6 },
  modalSectionLabel: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  modalBodyText: {
    color: "rgba(255,249,239,0.84)",
    lineHeight: 20
  },
  cleanFactsList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    overflow: "hidden"
  },
  factLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)"
  },
  factLineLabel: {
    color: "rgba(255,249,239,0.58)",
    fontSize: 12,
    fontWeight: "600"
  },
  factLineValue: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "700",
    maxWidth: "62%",
    textAlign: "right"
  },
  showcasePill: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    gap: 12
  },
  showcaseGroup: { gap: 8 },
  showcaseGroupLabel: {
    color: "rgba(255,249,239,0.64)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35
  },
  showcaseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8
  },
  showcaseArtTile: {
    width: "48.5%",
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "flex-end"
  },
  eventArtBeam: {
    position: "absolute",
    width: 136,
    height: 24,
    backgroundColor: "rgba(255,230,210,0.10)",
    transform: [{ rotate: "-12deg" }],
    top: 18,
    left: -8
  },
  eventArtOrb: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.02)",
    right: -10,
    top: -6
  },
  musicPulse: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 999,
    left: -10,
    bottom: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)"
  },
  showcaseTileFooter: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(8,8,8,0.34)"
  },
  showcaseTileTitle: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15
  },
  emptyCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#1E1B16",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 8
  },
  emptyPulseOrb: {
    width: 92,
    height: 92,
    borderRadius: 999,
    backgroundColor: "rgba(194,74,34,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginBottom: 6
  },
  emptyStatus: {
    color: "rgba(255,245,236,0.72)",
    fontSize: 12,
    fontWeight: "700"
  },
  emptyTitle: { color: "#FFF8EE", ...theme.type.titleMd },
  primaryInlineAction: {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D35C33",
    backgroundColor: "rgba(194,74,34,0.24)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  primaryInlineActionText: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "800"
  },
  emptyToggleRow: {
    marginTop: 2,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  emptyToggleText: {
    flex: 1,
    color: "rgba(255,245,236,0.75)",
    ...theme.type.caption
  },
  emptyToggleHelper: {
    width: "100%",
    color: "rgba(191,231,203,0.86)",
    ...theme.type.caption
  },
  notifyToggle: {
    width: 42,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 2,
    justifyContent: "center"
  },
  notifyToggleOn: {
    borderColor: "rgba(194,74,34,0.7)",
    backgroundColor: "rgba(194,74,34,0.38)"
  },
  notifyKnob: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#D8D0C9"
  },
  notifyKnobOn: {
    transform: [{ translateX: 16 }],
    backgroundColor: "#FFF8EE"
  },
  emptyActionsRow: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    marginTop: 2
  },
  emptySecondaryBtn: {
    flex: 1.25,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)"
  },
  emptySecondaryBtnText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700"
  },
  emptyGhostBtn: {
    flex: 0.9,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  emptyGhostBtnText: {
    color: "rgba(255,245,236,0.84)",
    fontSize: 12,
    fontWeight: "700"
  },
  contextLabelText: {
    color: "rgba(255,245,236,0.82)",
    ...theme.type.caption,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4
  },
  actionDisabled: { opacity: 0.7 },
  actionDock: {
    marginTop: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14
  },
  dockButton: {
    width: 62,
    height: 62,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1
  },
  dockButtonGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.14)"
  },
  dockButtonPrimary: {
    backgroundColor: "#C24A22",
    borderColor: "#D35C33"
  },
  dockButtonPrimaryWide: {
    width: 156,
    borderRadius: 16
  },
  dockButtonGhostText: { color: "#FFF8EE", fontSize: 28, fontWeight: "700", marginTop: -2 },
  dockButtonPrimaryText: { color: "#FFF8EE", fontSize: 18, fontWeight: "700", marginTop: -1 },
  dockMiniButton: {
    width: 50,
    height: 50,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  dockMiniButtonMid: { transform: [{ translateY: -2 }] },
  dockMiniRadarWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  dockMiniRadarRingOuter: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(243,210,195,0.42)"
  },
  dockMiniRadarRingInner: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(243,210,195,0.32)"
  },
  dockMiniRadarCore: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#F3D2C3"
  },
  dockMiniRadarSweep: {
    position: "absolute",
    width: 10,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(243,210,195,0.72)",
    transform: [{ rotate: "-26deg" }, { translateX: 4 }]
  },
  dockMiniRadarBlip: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#F3D2C3",
    right: 3,
    top: 4
  },
  noticeText: {
    color: "#BFE7CB",
    ...theme.type.caption,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6
  }
});
