import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../app/AppProvider";
import { getSupabaseClient } from "../../lib/supabase";
import { theme } from "../../theme";
import type { EventRecord, RSVPStatus } from "../../types/domain";
import { listEventAudienceMetrics, listUpcomingEvents, startEventCrewThreadSeed } from "../events/eventRepository";
import { useCrewVisibilityState } from "../events/useCrewVisibilityState";
import { useEventRsvpState } from "../events/useEventRsvpState";
import type { MatchesStackParamList } from "./MatchesNavigator";
import { createSwipeDecision, listMatchStackCandidates, type MatchCandidate } from "./matchRepository";

const demoCandidates: MatchCandidate[] = [
  {
    id: "c1",
    name: "Neon Ally",
    age: 26,
    city: "Los Angeles",
    bio: "Usually at house sets, likes meeting new people before doors open. Big on group safety and sticking together.",
    vibeTags: ["House", "Festival Crew", "Sober-Friendly"],
    eventId: "sample-1",
    eventName: "Warehouse Pulse",
    overlapReason: "Shared event + vibe: House",
    mode: "community",
    distanceKm: 8,
    height: "5'6\"",
    education: "UCLA",
    jobTitle: "Event Producer",
    soberPreference: "mixed",
    connectionType: "individual",
    previousEvents: ["Warehouse Pulse", "Neon Garden", "Sunset District"]
  },
  {
    id: "c2",
    name: "Bass Friend",
    age: 24,
    city: "San Diego",
    bio: "Into bass-heavy lineups and afters. Looking for a chill crew to coordinate sets and rides.",
    vibeTags: ["Bass", "Afters"],
    eventId: "sample-2",
    eventName: "Neon Frequency",
    overlapReason: "Shared event + genre: Dubstep",
    mode: "community",
    distanceKm: 24,
    height: "5'10\"",
    education: "SDSU",
    jobTitle: "Sound Engineer",
    soberPreference: "non_sober",
    connectionType: "group",
    previousEvents: ["Neon Frequency", "Bassline Harbor"]
  },
  {
    id: "c3",
    name: "Melodic Motion",
    age: 28,
    city: "San Francisco",
    bio: "Loves melodic techno and sunrise sets. Down to meet people with good communication and a respectful vibe.",
    vibeTags: ["Melodic Techno", "Techno"],
    eventId: "sample-3",
    eventName: "Afterhours Signal",
    overlapReason: "Shared event attendance",
    mode: "community",
    distanceKm: 12,
    height: "5'8\"",
    education: "UC Berkeley",
    jobTitle: "Designer",
    soberPreference: "sober",
    connectionType: "individual",
    previousEvents: ["Afterhours Signal", "Sunrise Terrace", "Loft Sessions"]
  }
];

export function MatchesScreen() {
  type TopTab = "for_you" | "matches_hub";
  type MatchInboxTab = "liked" | "likes_you" | "matches";
  type CrewGatewayEvent = Pick<EventRecord, "id" | "title" | "city" | "startsAt" | "genreTags"> & { rsvpStatus: RSVPStatus };
  const SWIPE_THRESHOLD = 110;
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
  const stackHeight = Math.max(410, Math.min(570, SCREEN_HEIGHT - 320));
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MatchesStackParamList>>();
  const { session, matchFilters, profileDraft } = useAppState();
  const { refreshRsvps } = useEventRsvpState(session?.user?.id ?? null);
  const { visibility, setLooking, refreshVisibility } = useCrewVisibilityState(session?.user?.id ?? null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [passedCount, setPassedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchSuccessMessage, setMatchSuccessMessage] = useState<string | null>(null);
  const [swipeHint, setSwipeHint] = useState<"like" | "pass" | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [activeTopTab, setActiveTopTab] = useState<TopTab>("for_you");
  const [activeMatchTab, setActiveMatchTab] = useState<MatchInboxTab>("likes_you");
  const [likedProfiles, setLikedProfiles] = useState<MatchCandidate[]>([]);
  const [matchedProfiles, setMatchedProfiles] = useState<MatchCandidate[]>([]);
  const [incomingLikesProfiles, setIncomingLikesProfiles] = useState<MatchCandidate[]>([]);
  const [crewGatewayEvents, setCrewGatewayEvents] = useState<CrewGatewayEvent[]>([]);
  const [isLoadingCrewGateway, setIsLoadingCrewGateway] = useState(true);
  const [crewGatewayMetrics, setCrewGatewayMetrics] = useState<Record<string, { goingCount: number; lookingForCrewCount: number }>>({});
  const [selectedCrewEventId, setSelectedCrewEventId] = useState<string | null>(null);
  const [hasSeenCrewVisibilityHint, setHasSeenCrewVisibilityHint] = useState(
    Boolean(session?.user?.user_metadata?.crew_visibility_hint_seen)
  );
  const [showCrewVisibilityHint, setShowCrewVisibilityHint] = useState(false);
  const [notifyCrewActivity, setNotifyCrewActivity] = useState(false);
  const photoStageHeight = Math.max(300, Math.min(520, stackHeight - 12));

  if (Platform.OS === "android" && (UIManager as any).setLayoutAnimationEnabledExperimental) {
    (UIManager as any).setLayoutAnimationEnabledExperimental(true);
  }

  const hasRealSession = Boolean(session?.user?.id);
  const liveDemoCandidates = useMemo(() => {
    const first = demoCandidates[0];
    if (!first) return demoCandidates;
    const liveFirst: MatchCandidate = {
      ...first,
      name: profileDraft.displayName.trim() || first.name,
      age: /^\d{4}-\d{2}-\d{2}$/.test(profileDraft.birthdate) ? Number.parseInt(formatAgeFromBirthdateForDemo(profileDraft.birthdate), 10) || null : first.age,
      city: profileDraft.city.trim() || first.city,
      bio: profileDraft.bio.trim() || first.bio,
      vibeTags: profileDraft.vibeTags.length > 0 ? profileDraft.vibeTags : first.vibeTags,
      height: profileDraft.height.trim() || first.height,
      education: profileDraft.education.trim() || first.education
    };
    return [liveFirst, ...demoCandidates.slice(1)];
  }, [profileDraft.bio, profileDraft.birthdate, profileDraft.city, profileDraft.displayName, profileDraft.education, profileDraft.height, profileDraft.vibeTags]);

  const sourceCandidates = candidates.length > 0 ? candidates : liveDemoCandidates;
  const usingDemoFallback = !hasRealSession || candidates.length === 0;
  const plannedEventsForGateway = useMemo(() => crewGatewayEvents, [crewGatewayEvents]);
  const selectedCrewEvent = useMemo(
    () => (selectedCrewEventId ? plannedEventsForGateway.find((event) => event.id === selectedCrewEventId) ?? null : null),
    [plannedEventsForGateway, selectedCrewEventId]
  );
  const crewCandidates = useMemo(() => {
    if (!selectedCrewEvent) return [];
    return sourceCandidates.filter((candidate) => candidateMatchesCrewEvent(candidate, selectedCrewEvent));
  }, [selectedCrewEvent, sourceCandidates]);
  const swipe = React.useRef(new Animated.ValueXY()).current;
  const swipeActionLockedRef = React.useRef(false);
  const current = crewCandidates[index] ?? null;
  const upcomingStack = useMemo(() => crewCandidates.slice(index + 1, index + 3), [index, crewCandidates]);
  const likedOnlyProfiles = useMemo(
    () => likedProfiles.filter((liked) => !matchedProfiles.some((matched) => matched.id === liked.id)),
    [likedProfiles, matchedProfiles]
  );
  const inboxList = activeMatchTab === "liked" ? likedOnlyProfiles : activeMatchTab === "likes_you" ? incomingLikesProfiles : matchedProfiles;
  const tabCounts = {
    forYou: Math.max(crewCandidates.length - index, 0),
    liked: likedOnlyProfiles.length,
    likesYou: incomingLikesProfiles.length,
    matches: matchedProfiles.length
  };

  async function loadCandidates(options?: { refresh?: boolean }) {
    const isRefresh = options?.refresh ?? false;

    if (!session?.user?.id) {
      setCandidates([]);
      setIndex(0);
      setError(null);
      setMatchSuccessMessage(null);
      setIsLoading(false);
      return;
    }

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);
    setMatchSuccessMessage(null);
    setLikedProfiles([]);
    setMatchedProfiles([]);
    setIncomingLikesProfiles(usingDemoFallback ? demoCandidates.slice(1, 3) : []);

    try {
      const rows = await listMatchStackCandidates(session.user.id, 20, {
        radiusMiles: matchFilters.distanceMiles,
        expansionRadiusMiles: matchFilters.expansionDistanceMiles,
        strictDistance: matchFilters.strictDistance
      });
      setCandidates(rows);
      setIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh match stack.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadCandidates();
  }, [
    matchFilters.distanceMiles,
    matchFilters.expansionDistanceMiles,
    matchFilters.strictDistance,
    profileDraft.locationLat,
    profileDraft.locationLng,
    session?.user?.id
  ]);

  const loadCrewGatewayEvents = React.useCallback(async () => {
    if (!session?.user?.id) {
      setCrewGatewayEvents([]);
      setIsLoadingCrewGateway(false);
      return;
    }

    setIsLoadingCrewGateway(true);
    try {
      const [events, rsvps] = await Promise.all([listUpcomingEvents(50), refreshRsvps(), refreshVisibility()]);
      const going = events
        .filter((event) => rsvps[event.id] === "going")
        .map((event) => ({ ...event, rsvpStatus: "going" as const }));
      setCrewGatewayEvents(going);
      const metrics = await listEventAudienceMetrics(going.map((event) => event.id));
      setCrewGatewayMetrics(metrics);
    } finally {
      setIsLoadingCrewGateway(false);
    }
  }, [refreshRsvps, refreshVisibility, session?.user?.id]);

  useEffect(() => {
    void loadCrewGatewayEvents();
  }, [loadCrewGatewayEvents]);

  useFocusEffect(
    React.useCallback(() => {
      // Always land on event gateway first; stack opens only after explicit event selection.
      setSelectedCrewEventId(null);
      setIndex(0);
      void loadCrewGatewayEvents();
      return undefined;
    }, [loadCrewGatewayEvents])
  );

  useEffect(() => {
    if (!selectedCrewEventId) return;
    // If there are no "Going" events (or selected event is no longer going), return to gateway.
    if (crewGatewayEvents.length === 0 || !crewGatewayEvents.some((event) => event.id === selectedCrewEventId)) {
      setSelectedCrewEventId(null);
      setIndex(0);
    }
  }, [crewGatewayEvents, selectedCrewEventId]);

  useEffect(() => {
    if (!selectedCrewEventId) return;
    if (!visibility[selectedCrewEventId]) {
      setSelectedCrewEventId(null);
      setIndex(0);
    }
  }, [selectedCrewEventId, visibility]);

  useEffect(() => {
    setHasSeenCrewVisibilityHint(Boolean(session?.user?.user_metadata?.crew_visibility_hint_seen));
  }, [session?.user?.user_metadata?.crew_visibility_hint_seen]);

  useEffect(() => {
    setIndex(0);
  }, [selectedCrewEventId]);

  useEffect(() => {
    swipe.setValue({ x: 0, y: 0 });
    setSwipeHint(null);
    setIsDraggingCard(false);
    setIsProfileExpanded(false);
    swipeActionLockedRef.current = false;
  }, [current?.id, swipe]);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [isProfileExpanded]);

  useEffect(() => {
    if (activeTopTab === "matches_hub" && current == null && tabCounts.matches === 0 && tabCounts.liked === 0 && tabCounts.likesYou === 0) {
      setActiveTopTab("for_you");
    }
  }, [activeTopTab, current, tabCounts.likesYou, tabCounts.liked, tabCounts.matches]);

  async function markCrewVisibilityHintSeen() {
    if (hasSeenCrewVisibilityHint) {
      return;
    }
    setHasSeenCrewVisibilityHint(true);

    if (!session?.user?.id) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }
    await supabase.auth.updateUser({
      data: {
        ...(session.user.user_metadata ?? {}),
        crew_visibility_hint_seen: true
      }
    });
  }

  useEffect(() => {
    if (usingDemoFallback) {
      setIncomingLikesProfiles((prev) => (prev.length > 0 ? prev : demoCandidates.slice(1, 3)));
    }
  }, [usingDemoFallback]);

  function openProfileModal() {
    if (!current) return;
    setIsProfileExpanded(true);
  }

  async function handleDecision(decision: "like" | "pass") {
    if (!current) {
      return;
    }

    const canPersistSwipe =
      hasRealSession &&
      session?.user?.id &&
      !usingDemoFallback &&
      isUuidLike(current.id);

    if (canPersistSwipe) {
      setIsSubmitting(true);
      setError(null);
      const result = await createSwipeDecision({
        actorProfileId: session.user.id,
        targetProfileId: current.id,
        eventId: current.eventId,
        mode: current.mode,
        decision
      });
      setIsSubmitting(false);
      if (!result.ok) {
        setError(result.error);
        swipeActionLockedRef.current = false;
        return;
      }
      if (result.matchCreated) {
        setMatchedProfiles((prev) => [current, ...prev.filter((item) => item.id !== current.id)]);
        setMatchSuccessMessage(`Mutual match with ${current.name}. Chat unlock is next.`);
        navigation.getParent()?.navigate("Messages" as never);
      } else {
        setMatchSuccessMessage(null);
      }
    }

    if (decision === "like") {
      setLikedProfiles((prev) => [current, ...prev.filter((item) => item.id !== current.id)]);
      setLikedCount((n) => n + 1);
    } else {
      setPassedCount((n) => n + 1);
    }

    setIndex((n) => n + 1);
  }

  function resetCardPosition() {
    Animated.spring(swipe, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      bounciness: 8
    }).start(() => {
      setSwipeHint(null);
      setIsDraggingCard(false);
    });
  }

  function animateOutAndDecide(decision: "like" | "pass") {
    if (swipeActionLockedRef.current || isSubmitting || !current) {
      return;
    }
    swipeActionLockedRef.current = true;
    const targetX = decision === "like" ? SCREEN_WIDTH * 1.2 : -SCREEN_WIDTH * 1.2;
    Animated.timing(swipe, {
      toValue: { x: targetX, y: 0 },
      duration: 180,
      useNativeDriver: false
    }).start(async ({ finished }) => {
      if (!finished) {
        swipeActionLockedRef.current = false;
        setIsDraggingCard(false);
        return;
      }
      await handleDecision(decision);
      swipe.setValue({ x: 0, y: 0 });
      setSwipeHint(null);
      setIsDraggingCard(false);
    });
  }

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          if (!isSubmitting && current) {
            setIsDraggingCard(true);
          }
        },
        onPanResponderMove: (_evt, gesture) => {
          if (isSubmitting || !current) {
            return;
          }
          swipe.setValue({ x: gesture.dx, y: gesture.dy * 0.15 });
          if (gesture.dx > 35) {
            setSwipeHint("like");
          } else if (gesture.dx < -35) {
            setSwipeHint("pass");
          } else {
            setSwipeHint(null);
          }
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (isSubmitting || !current) {
            resetCardPosition();
            return;
          }
          if (gesture.dx > SWIPE_THRESHOLD) {
            animateOutAndDecide("like");
            return;
          }
          if (gesture.dx < -SWIPE_THRESHOLD) {
            animateOutAndDecide("pass");
            return;
          }
          resetCardPosition();
        },
        onPanResponderTerminate: () => resetCardPosition()
      }),
    [SWIPE_THRESHOLD, current, isSubmitting, swipe]
  );

  const cardAnimatedStyle = {
    transform: [
      { translateX: swipe.x },
      { translateY: swipe.y },
      {
        scale: swipe.x.interpolate({
          inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
          outputRange: [0.97, 1, 0.97]
        })
      },
      {
        rotate: swipe.x.interpolate({
          inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
          outputRange: ["-10deg", "0deg", "10deg"]
        })
      }
    ]
  } as const;

  const likeBadgeOpacity = swipe.x.interpolate({
    inputRange: [0, 40, SWIPE_THRESHOLD],
    outputRange: [0, 0.35, 1],
    extrapolate: "clamp"
  });

  const ghostShift = swipe.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: [-6, 0, 6],
    extrapolate: "clamp"
  });

  const passBadgeOpacity = swipe.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -40, 0],
    outputRange: [1, 0.35, 0],
    extrapolate: "clamp"
  });

  return (
    <View style={styles.screenRoot}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 14, 34),
          paddingBottom: Math.max(insets.bottom + 18, 24),
          minHeight: SCREEN_HEIGHT
        }
      ]}
      scrollEnabled={!isDraggingCard}
      alwaysBounceVertical
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void loadCandidates({ refresh: true })}
          tintColor={theme.colors.accent}
          progressBackgroundColor="#1A1712"
        />
      }
    >
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Text style={styles.brandText}>R4V3</Text>
          <View style={styles.liveDot} />
        </View>
        <View style={styles.topBarSpacer} />
      </View>

      {error || matchSuccessMessage ? (
        <View style={styles.statusStripCompact}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {matchSuccessMessage ? <Text style={styles.success}>{matchSuccessMessage}</Text> : null}
        </View>
      ) : null}

      {!session?.user?.id ? (
        <View style={styles.authNoticeStrip}>
          <Text style={styles.authNoticeText}>Sign up to appear in event-based matching.</Text>
          <Pressable
            onPress={() => {
              const rootNav: any = navigation.getParent()?.getParent();
              rootNav?.navigate?.("Auth");
            }}
            style={styles.authNoticeAction}
          >
            <Text style={styles.authNoticeActionText}>Sign in</Text>
          </Pressable>
        </View>
      ) : null}

      {activeTopTab !== "for_you" ? (
        <View style={styles.inboxShell}>
          <View style={styles.inboxHeader}>
            <Text style={styles.inboxTitle}>
              {activeMatchTab === "liked" ? "People you liked" : activeMatchTab === "likes_you" ? "People who like you" : "Your matches"}
            </Text>
            <Text style={styles.inboxSubtitle}>
              {activeMatchTab === "likes_you" && !usingDemoFallback
                ? "Incoming likes will appear here when backend sync is connected."
                : "Inside Matches, switch between likes, incoming likes, and mutual matches."}
            </Text>
          </View>

          <View style={styles.inboxSegmentRow}>
            <Pressable
              onPress={() => setActiveMatchTab("liked")}
              style={[styles.inboxSegmentChip, activeMatchTab === "liked" && styles.inboxSegmentChipActive]}
            >
              <Text style={[styles.inboxSegmentText, activeMatchTab === "liked" && styles.inboxSegmentTextActive]}>
                Liked {tabCounts.liked > 0 ? `(${tabCounts.liked})` : ""}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveMatchTab("likes_you")}
              style={[styles.inboxSegmentChip, activeMatchTab === "likes_you" && styles.inboxSegmentChipActive]}
            >
              <Text style={[styles.inboxSegmentText, activeMatchTab === "likes_you" && styles.inboxSegmentTextActive]}>
                Likes You {tabCounts.likesYou > 0 ? `(${tabCounts.likesYou})` : ""}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveMatchTab("matches")}
              style={[styles.inboxSegmentChip, activeMatchTab === "matches" && styles.inboxSegmentChipActive]}
            >
              <Text style={[styles.inboxSegmentText, activeMatchTab === "matches" && styles.inboxSegmentTextActive]}>
                Matches {tabCounts.matches > 0 ? `(${tabCounts.matches})` : ""}
              </Text>
            </Pressable>
          </View>

          {inboxList.length > 0 ? (
            <View style={styles.inboxList}>
              {inboxList.map((person) => (
                <View key={`${activeMatchTab}-${person.id}`} style={styles.inboxCard}>
                  <View style={styles.inboxCardHeader}>
                    <View>
                      <Text style={styles.inboxCardName}>
                        {person.name}{person.age ? `, ${person.age}` : ""}
                      </Text>
                      <Text style={styles.inboxCardMeta}>{person.city}</Text>
                    </View>
                    <View style={styles.inboxBadge}>
                      <Text style={styles.inboxBadgeText}>
                        {activeMatchTab === "liked" ? "Liked" : activeMatchTab === "likes_you" ? "Likes You" : "Matched"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.inboxCardBody} numberOfLines={2}>{person.bio}</Text>
                  <View style={styles.tags}>
                    {person.vibeTags.slice(0, 4).map((tag) => (
                      <View key={`${person.id}-${tag}`} style={[styles.tag, styles.inlineTag]}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.inboxEmpty}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.body}>
                {activeMatchTab === "liked"
                  ? "Swipe right on profiles you want to connect with. They’ll show up here."
                  : activeMatchTab === "likes_you"
                    ? "Incoming likes will land here."
                    : "Mutual matches will appear here after both people connect."}
              </Text>
            </View>
          )}
        </View>
      ) : !selectedCrewEventId ? (
      <View style={styles.crewGatewaySection}>
        <View style={styles.crewGatewaySectionHeader}>
          <Text style={styles.crewGatewaySectionTitle}>Your planned events</Text>
          <Text style={styles.crewGatewaySectionSubtitle}>
            Choose an event you’re going to, then start crew-based matching for that event.
          </Text>
        </View>

        {isLoadingCrewGateway ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.body}>Loading your events…</Text>
          </View>
        ) : plannedEventsForGateway.length > 0 ? (
          <View style={styles.crewGatewayGrid}>
            {plannedEventsForGateway.map((event, idx) => {
              const metrics = crewGatewayMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
              const candidateCount = metrics.lookingForCrewCount;
              const goingCount = metrics.goingCount;
              const lookingForCrewEnabled = visibility[event.id] ?? false;
              const canOpenMatching = lookingForCrewEnabled;
              return (
                <Pressable
                  key={`crew-event-${event.id}`}
                  style={({ pressed }) => [
                    styles.crewGatewaySquareCard,
                    !canOpenMatching && styles.crewGatewaySquareCardDisabled,
                    pressed && styles.crewGatewaySquareCardPressed
                  ]}
                  onPress={() => {
                    if (!canOpenMatching) {
                      Alert.alert("Enable Looking for crew", "Turn on Looking for crew to open event discovery.");
                      return;
                    }
                    setSelectedCrewEventId(event.id);
                  }}
                >
                  <View style={[styles.crewGatewayCardShellArt, crewGatewayPalette(idx)]}>
                    <View style={styles.crewGatewayGlowA} />
                    <View style={styles.crewGatewayGlowB} />
                    <View style={styles.crewGatewayBeamA} />
                    <View style={styles.crewGatewayBeamB} />
                    <View style={styles.crewGatewayGridScan} />
                    <View style={styles.crewGatewayWaveLine} />
                    <View style={styles.crewGatewayWaveLineAlt} />
                    <View style={styles.crewGatewayHeroRow}>
                      <View style={styles.crewGatewayHeroGenreChip}>
                        <Text style={styles.crewGatewayHeroGenreChipText}>
                          {(event.genreTags?.[0] ?? "Event").slice(0, 14).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.crewGatewayHeroMetricBubble}>
                        <Text style={styles.crewGatewayHeroMetricPrimary}>{goingCount} Going</Text>
                        <Text style={styles.crewGatewayHeroMetricSecondary}>{candidateCount} looking for crew</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.crewGatewayCardBody}>
                    <Text style={styles.crewGatewaySquareTitle} numberOfLines={2}>{event.title}</Text>
                    <View style={styles.crewGatewayMetaWrap}>
                      <View style={styles.crewGatewayMetaRow}>
                        <Text style={styles.crewGatewayMetaIcon}>⌖</Text>
                        <Text style={styles.crewGatewaySquareMeta}>{event.city || "City TBD"}</Text>
                      </View>
                      <View style={styles.crewGatewayMetaRow}>
                        <Text style={styles.crewGatewayMetaIcon}>◷</Text>
                        <Text style={styles.crewGatewaySquareMeta}>{formatEventDateShort(event.startsAt)}</Text>
                      </View>
                    </View>

                    <Pressable
                      hitSlop={8}
                      onPress={(pressEvent) => {
                        pressEvent.stopPropagation?.();
                        if (!session?.user?.id) {
                          Alert.alert(
                            "Sign in required",
                            "Sign up to appear in event-based matching.",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Sign in",
                                onPress: () => {
                                  const rootNav: any = navigation.getParent()?.getParent();
                                  rootNav?.navigate?.("Auth");
                                }
                              }
                            ]
                          );
                          return;
                        }
                        const nextEnabled = !lookingForCrewEnabled;
                        void setLooking(event.id, nextEnabled);
                        if (nextEnabled && !hasSeenCrewVisibilityHint) {
                          setShowCrewVisibilityHint(true);
                          void markCrewVisibilityHintSeen();
                        }
                      }}
                      style={[
                        styles.crewGatewayLookingBar,
                        lookingForCrewEnabled && styles.crewGatewayLookingBarActive
                      ]}
                    >
                      <Text style={styles.crewGatewayLookingBarLabel}>Looking for Crew</Text>
                      <View style={styles.crewGatewayLookingBarRight}>
                        <View
                          style={[
                            styles.crewGatewayLookingBarDot,
                            lookingForCrewEnabled && styles.crewGatewayLookingBarDotActive
                          ]}
                        />
                        <Text
                          style={[
                            styles.crewGatewayLookingBarValue,
                            lookingForCrewEnabled && styles.crewGatewayLookingBarValueActive
                          ]}
                        >
                          {lookingForCrewEnabled ? "On" : "Off"}
                        </Text>
                      </View>
                    </Pressable>

                    <View
                      style={[
                        styles.crewGatewayOpenBar,
                        canOpenMatching && styles.crewGatewayOpenBarActive
                      ]}
                    >
                        <Text
                          style={[
                            styles.crewGatewayOpenBarText,
                            canOpenMatching && styles.crewGatewayOpenBarTextActive
                          ]}
                        >
                        {!lookingForCrewEnabled ? "Turn on Looking for crew to open matching" : "Open crew matching"}
                      </Text>
                      <Text
                        style={[
                          styles.crewGatewayOpenBarArrow,
                          canOpenMatching && styles.crewGatewayOpenBarTextActive
                        ]}
                      >
                        ›
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.inboxEmpty}>
            <Text style={styles.emptyTitle}>No events marked Going yet</Text>
            <Text style={styles.body}>
              Mark an event as “Going” in Events to unlock event-based matching.
            </Text>
          </View>
        )}
      </View>
      ) : (
      <View style={styles.stackShell}>
        <View style={styles.crewStackHeader}>
          <Pressable style={styles.crewBackChip} onPress={() => setSelectedCrewEventId(null)}>
            <Text style={styles.crewBackChipText}>← Events</Text>
          </Pressable>
          <Text style={styles.crewStackHeaderTitle}>
            {selectedCrewEvent?.title ?? "Crew Matching"}
          </Text>
          <View style={styles.crewBackChipGhost} />
        </View>
        <View style={[styles.stackArea, { minHeight: stackHeight }]}>
          {isLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.body}>Loading match stack...</Text>
            </View>
          ) : null}

          {[...upcomingStack].reverse().map((candidate, offset) => (
            <Animated.View
              key={candidate.id}
              style={[
                styles.stackGhostCard,
                {
                  top: 12 + offset * 9,
                  bottom: 12 - offset * 2,
                  left: 12 + offset * 5,
                  right: 12 + offset * 5,
                  transform: [{ translateX: Animated.multiply(ghostShift, offset + 0.4) }]
                }
              ]}
            />
          ))}

          {current ? (
            <Animated.View
              style={[styles.primaryCard, cardAnimatedStyle, isProfileExpanded && styles.primaryCardExpanded]}
              {...(isProfileExpanded ? {} : panResponder.panHandlers)}
            >
              <Animated.View style={[styles.swipeBadge, styles.swipeBadgeLeft, { opacity: passBadgeOpacity }]}>
                <Text style={styles.swipeBadgeText}>SKIP</Text>
              </Animated.View>
              <Animated.View style={[styles.swipeBadge, styles.swipeBadgeRight, { opacity: likeBadgeOpacity }]}>
                <Text style={styles.swipeBadgeText}>CONNECT</Text>
              </Animated.View>

              <View style={[styles.photoStage, { flex: 1, minHeight: photoStageHeight }]}>
                <View style={styles.photoGlow} />
                <View style={styles.photoOrb} />
                <View style={styles.photoNoiseStripe} />
                <View style={styles.stageBeamLeft} />
                <View style={styles.stageBeamRight} />
                <View style={styles.photoOverlay}>
                  <View pointerEvents="none" style={styles.photoBottomFadeSoft} />
                  <View pointerEvents="none" style={styles.photoBottomFadeStrong} />
                  <View style={styles.photoTopMeta}>
                    <View style={styles.eventPill}>
                      <Text style={styles.eventPillText}>{current.eventName}</Text>
                    </View>
                    <View style={styles.photoModePill}>
                      <Text style={styles.photoModePillText}>{current.mode}</Text>
                    </View>
                  </View>

                  <View style={styles.photoBottomOverlay}>
                    <View style={styles.collapsedCardMeta}>
                      <View style={styles.collapsedCardMetaMain}>
                        <Text style={styles.photoTitle}>
                          {current.name}{current.age ? `, ${current.age}` : ""}
                        </Text>
                        <Text style={styles.photoSubtitle}>{current.city}</Text>
                        <Text style={styles.photoDistance}>{formatDistanceAway(current)}</Text>
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
                    <Text style={styles.modalSectionLabel}>About me</Text>
                    <Text style={styles.modalBodyText}>{current.bio}</Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionLabel}>Basic info</Text>
                    <View style={styles.cleanFactsList}>
                      <FactLine label="Location" value={current.city ?? "Not shared"} />
                      <FactLine label="Distance" value={formatDistanceAway(current)} />
                      <FactLine label="Height" value={profileFact(current, "height")} />
                      <FactLine label="Education" value={profileFact(current, "education")} />
                    </View>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionLabel}>Showcase</Text>
                    <View style={styles.showcasePill}>
                      <View style={styles.showcaseGroup}>
                        <Text style={styles.showcaseGroupLabel}>Previously attended</Text>
                        <View style={styles.showcaseGrid}>
                          {(current.previousEvents && current.previousEvents.length > 0
                            ? current.previousEvents
                            : [current.eventName ?? "Shared event"]
                          ).slice(0, 4).map((eventName, idx) => (
                            <EventArtTile key={`${eventName}-${idx}`} title={eventName} index={idx} />
                          ))}
                        </View>
                      </View>

                      <View style={styles.showcaseGroup}>
                        <Text style={styles.showcaseGroupLabel}>Favorite music</Text>
                        <View style={styles.showcaseGrid}>
                          {(current.vibeTags && current.vibeTags.length > 0
                            ? current.vibeTags
                            : ["House", "Techno", "Bass", "Afters"]
                          ).slice(0, 4).map((tag, idx) => (
                            <MusicArtTile key={`${tag}-${idx}`} title={tag} index={idx} />
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              ) : null}
              {swipeHint ? (
                <View style={styles.cardBodySlim}>
                  <Text style={styles.swipeHintText}>
                    {swipeHint === "like" ? "Release to connect" : "Release to skip"}
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          ) : (
            <View style={styles.emptyCard}>
              <EmptyCrewRadar />
              <Text style={styles.emptyTitle}>You&apos;re early.</Text>
              <Text style={styles.body}>
                Most ravers start looking for crews closer to the event. As more people RSVP, new crew candidates will appear here.
              </Text>
              <Text style={styles.emptyStatus}>0 people currently looking for a crew</Text>
              <View style={styles.emptyToggleRow}>
                <Pressable style={[styles.notifyToggle, notifyCrewActivity && styles.notifyToggleOn]} onPress={() => setNotifyCrewActivity((v) => !v)}>
                  <View style={[styles.notifyKnob, notifyCrewActivity && styles.notifyKnobOn]} />
                </Pressable>
                <Text style={styles.emptyToggleText}>Notify me when people start looking for a crew</Text>
              </View>
              {notifyCrewActivity ? (
                <Text style={styles.emptyToggleHelper}>We&apos;ll notify you when new crew candidates appear for this event.</Text>
              ) : null}
              {selectedCrewEvent && session?.user?.id ? (
                <Pressable
                  style={[styles.dockActionButton, styles.dockActionButtonPrimary, { marginTop: 10 }]}
                  onPress={() => {
                    void startEventCrewThreadSeed(session.user.id, selectedCrewEvent.id);
                  }}
                >
                  <Text style={styles.dockActionButtonPrimaryText}>Start a crew for this event</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </View>
      )}

      {activeTopTab === "for_you" && Boolean(selectedCrewEventId) ? (
        <Text style={styles.contextLabelText}>{current?.discoveryLabel ?? (current ? "Also going to this event" : "Going to the same event")}</Text>
      ) : null}

      {activeTopTab === "for_you" && !isProfileExpanded && Boolean(selectedCrewEventId) ? (
      <View style={styles.actionDock}>
        <Pressable
          style={[styles.dockActionButton, styles.dockActionButtonGhost, isSubmitting && styles.actionDisabled]}
          onPress={() => animateOutAndDecide("pass")}
          disabled={isSubmitting || !current}
        >
          <Text style={styles.dockActionButtonGhostText}>Skip</Text>
        </Pressable>
        <Pressable style={[styles.dockMiniButton, styles.dockMiniButtonMid]}>
          <Text style={styles.dockMiniText}>♪</Text>
        </Pressable>
        <Pressable
          style={[styles.dockActionButton, styles.dockActionButtonPrimary, isSubmitting && styles.actionDisabled]}
          onPress={() => animateOutAndDecide("like")}
          disabled={isSubmitting || !current || current.connectionStatus === "pending_outgoing" || current.connectionStatus === "matched"}
        >
          <Text style={styles.dockActionButtonPrimaryText}>
            {isSubmitting
              ? "…"
              : current?.connectionStatus === "pending_incoming"
                ? "Connect Back"
                : current?.connectionStatus === "pending_outgoing"
                  ? "Pending"
                  : current?.connectionStatus === "matched"
                    ? "Matched"
                    : "Connect"}
          </Text>
        </Pressable>
      </View>
      ) : null}

    </ScrollView>

    {showCrewVisibilityHint ? (
      <View pointerEvents="box-none" style={styles.crewHintOverlay}>
        <View style={[styles.crewHintSheet, { paddingBottom: Math.max(insets.bottom + 10, 18) }]}>
          <Text style={styles.crewHintTitle}>You’re now visible in event-based matching.</Text>
          <Text style={styles.crewHintBody}>Other ravers going to this event can connect with you.</Text>
          <Pressable style={styles.crewHintButton} onPress={() => setShowCrewVisibilityHint(false)}>
            <Text style={styles.crewHintButtonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    ) : null}
    </View>
  );
}

function profileFact(candidate: MatchCandidate | null, key: "height" | "education" | "jobTitle") {
  const value = candidate?.[key];
  return value && String(value).trim() ? String(value) : "Not shared";
}

function formatSober(value: MatchCandidate["soberPreference"] | undefined) {
  if (value === "sober") return "Sober";
  if (value === "non_sober") return "Non-sober";
  if (value === "mixed") return "Mixed / either";
  return "Not shared";
}

function formatAgeFromBirthdateForDemo(birthdate: string): string {
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 18 && age < 120 ? String(age) : "";
}

function formatDistanceAway(candidate: MatchCandidate | null) {
  const km = typeof candidate?.distanceKm === "number" ? candidate.distanceKm : null;
  if (km != null && Number.isFinite(km)) {
    return `${Math.max(1, Math.round(km * 0.621371))} miles away`;
  }
  const text = candidate?.previousEvents?.find((value) => /km away/i.test(value));
  const kmMatch = text?.match(/(\d+)\s*km away/i);
  if (kmMatch) {
    return `${Math.max(1, Math.round(Number.parseInt(kmMatch[1], 10) * 0.621371))} miles away`;
  }
  return "Local area";
}

function isUuidLike(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeMatchEventKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateMatchesCrewEvent(
  candidate: MatchCandidate,
  event: Pick<EventRecord, "id" | "title">
) {
  if (candidate.eventId && candidate.eventId === event.id) return true;
  const candidateEventName = normalizeMatchEventKey(candidate.eventName ?? null);
  const eventTitle = normalizeMatchEventKey(event.title);
  return Boolean(candidateEventName && eventTitle && candidateEventName === eventTitle);
}

function formatEventDateShort(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return startsAt;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

function FactRow(props: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{props.label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{props.value}</Text>
    </View>
  );
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
        <Text style={styles.eventArtTitle} numberOfLines={2}>{props.title}</Text>
      </View>
    </View>
  );
}

function MusicArtTile(props: { title: string; index: number }) {
  return (
    <View style={[styles.showcaseArtTile, musicArtPalette(props.index)]}>
      <View style={styles.musicPulse} />
      <View style={styles.eventArtBeam} />
      <View style={styles.showcaseTileFooter}>
        <Text style={styles.eventArtTitle} numberOfLines={2}>{props.title}</Text>
      </View>
    </View>
  );
}

function EmptyCrewRadar() {
  const pulseA = React.useRef(new Animated.Value(0)).current;
  const pulseB = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loopA = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseA, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseA, { toValue: 0, duration: 0, useNativeDriver: true })
      ])
    );
    const loopB = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(pulseB, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseB, { toValue: 0, duration: 0, useNativeDriver: true })
      ])
    );

    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
    };
  }, [pulseA, pulseB]);

  return (
    <View style={styles.radarWrap}>
      <View style={styles.radarCore} />
      <View style={styles.radarRingStaticA} />
      <View style={styles.radarRingStaticB} />
      <Animated.View
        style={[
          styles.radarPulseRing,
          {
            opacity: pulseA.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: pulseA.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.45] }) }]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.radarPulseRing,
          {
            opacity: pulseB.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] }),
            transform: [{ scale: pulseB.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.45] }) }]
          }
        ]}
      />
      <View style={[styles.radarNode, styles.radarNodeA]} />
      <View style={[styles.radarNode, styles.radarNodeB]} />
      <View style={[styles.radarNode, styles.radarNodeC]} />
      <View style={styles.radarSweep} />
    </View>
  );
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

function crewGatewayPalette(index: number) {
  const palettes = [
    { backgroundColor: "#221A14" },
    { backgroundColor: "#181622" },
    { backgroundColor: "#201519" },
    { backgroundColor: "#161E24" }
  ];
  return palettes[index % palettes.length];
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: "#11100D"
  },
  scroll: {
    flex: 1,
    backgroundColor: "#11100D"
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: "#11100D"
  },
  crewHintOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: 12
  },
  crewHintSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(17,16,13,0.98)",
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 10,
    marginBottom: 8
  },
  crewHintTitle: {
    color: "#F8F1E4",
    fontSize: 15,
    fontWeight: "800"
  },
  crewHintBody: {
    color: "rgba(248,241,228,0.78)",
    fontSize: 13,
    lineHeight: 18
  },
  crewHintButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.38)",
    backgroundColor: "rgba(211,92,51,0.14)",
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  crewHintButtonText: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "800"
  },
  topBar: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  topBarSpacer: {
    width: 24,
    height: 24
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 2
  },
  brandText: {
    color: "#F8F1E4",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#D94E25",
    marginTop: 2
  },
  modeTabsRow: {
    flexDirection: "row",
    gap: 6,
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  modeChipTop: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  modeChipTopActive: {
    backgroundColor: "rgba(211,92,51,0.12)",
    borderColor: "rgba(211,92,51,0.34)"
  },
  modeChipTopText: {
    color: "rgba(255,249,239,0.7)",
    fontSize: 12,
    fontWeight: "700"
  },
  modeChipTopTextActive: {
    color: "#FFF8EE"
  },
  filterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  filterButtonText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700"
  },
  stackShell: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "#1A1712",
    padding: 8,
    minHeight: 0,
    marginTop: 6
  },
  crewStackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 8
  },
  crewBackChip: {
    minWidth: 74,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center"
  },
  crewBackChipText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700"
  },
  crewBackChipGhost: {
    minWidth: 74
  },
  crewStackHeaderTitle: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
    textAlign: "center"
  },
  body: {
    color: "rgba(255,249,239,0.78)",
    ...theme.type.body
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  success: {
    color: "#B9F0C8",
    fontWeight: "600"
  },
  statusStripCompact: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4
  },
  inboxShell: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "#1A1712",
    padding: 12,
    marginTop: 6,
    gap: 10
  },
  crewGatewaySection: {
    marginTop: 8,
    gap: 12
  },
  crewGatewaySectionHeader: {
    paddingHorizontal: 4,
    gap: 4
  },
  crewGatewaySectionTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  crewGatewaySectionSubtitle: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 12,
    lineHeight: 17
  },
  inboxHeader: {
    gap: 4
  },
  inboxTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  inboxSubtitle: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 12,
    lineHeight: 17
  },
  inboxList: {
    gap: 10
  },
  crewGatewayGrid: {
    gap: 14
  },
  crewGatewaySquareCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#151311",
    overflow: "hidden"
  },
  crewGatewaySquareCardPressed: {
    transform: [{ scale: 0.985 }],
    borderColor: "rgba(211,92,51,0.22)",
    shadowColor: "#D35C33",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }
  },
  crewGatewaySquareCardDisabled: {
    borderColor: "rgba(255,255,255,0.06)",
    opacity: 0.82
  },
  crewGatewayCardShellArt: {
    height: 118,
    overflow: "hidden",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20
  },
  crewGatewayGlowA: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    left: -8,
    top: -20,
    backgroundColor: "#6C49FF",
    opacity: 0.14
  },
  crewGatewayGlowB: {
    position: "absolute",
    width: 220,
    height: 140,
    borderRadius: 999,
    right: 30,
    bottom: -18,
    backgroundColor: "#C24A22",
    opacity: 0.14
  },
  crewGatewayBeamA: {
    position: "absolute",
    left: -24,
    right: -24,
    top: 44,
    height: 3,
    backgroundColor: "rgba(216,119,255,0.30)",
    transform: [{ rotate: "-7deg" }]
  },
  crewGatewayBeamB: {
    position: "absolute",
    left: -24,
    right: -24,
    top: 60,
    height: 2,
    backgroundColor: "rgba(255,176,123,0.24)",
    transform: [{ rotate: "7deg" }]
  },
  crewGatewayGridScan: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.05,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.15)"
  },
  crewGatewayWaveLine: {
    position: "absolute",
    left: -20,
    right: -20,
    top: 54,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.35,
    transform: [{ rotate: "4deg" }]
  },
  crewGatewayWaveLineAlt: {
    position: "absolute",
    left: -20,
    right: -20,
    top: 72,
    height: 2,
    backgroundColor: "rgba(216,119,255,0.12)",
    opacity: 0.32,
    transform: [{ rotate: "-5deg" }]
  },
  crewGatewayHeroRow: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
  },
  crewGatewayHeroGenreChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,8,8,0.42)",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  crewGatewayHeroGenreChipText: {
    color: "#FFF8EE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9
  },
  crewGatewayHeroMetricBubble: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,9,12,0.42)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "flex-end",
    minWidth: 124
  },
  crewGatewayHeroMetricPrimary: {
    color: "rgba(255,249,239,0.92)",
    fontSize: 16,
    fontWeight: "800"
  },
  crewGatewayHeroMetricSecondary: {
    color: "rgba(255,249,239,0.68)",
    fontSize: 10,
    fontWeight: "600"
  },
  crewGatewayCardBody: {
    backgroundColor: "#151311",
    padding: 14,
    gap: 12
  },
  crewGatewaySquareTitle: {
    color: "#FFF8EE",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800"
  },
  crewGatewayMetaWrap: {
    gap: 6
  },
  authNoticeStrip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.26)",
    backgroundColor: "rgba(211,92,51,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  authNoticeText: {
    color: "#F8F1E4",
    fontSize: 12.5,
    fontWeight: "700",
    flex: 1
  },
  authNoticeAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  authNoticeActionText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800"
  },
  crewGatewayMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  crewGatewayMetaIcon: {
    color: "rgba(204,123,255,0.82)",
    fontSize: 15,
    lineHeight: 16
  },
  crewGatewaySquareMeta: {
    color: "rgba(255,249,239,0.78)",
    fontSize: 13,
    fontWeight: "600"
  },
  crewGatewayLookingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,168,92,0.16)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  crewGatewayLookingBarActive: {
    borderColor: "rgba(211,92,51,0.22)",
    backgroundColor: "rgba(211,92,51,0.04)"
  },
  crewGatewayLookingBarLabel: {
    color: "#F8C386",
    fontSize: 14,
    fontWeight: "800"
  },
  crewGatewayLookingBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  crewGatewayLookingBarDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)"
  },
  crewGatewayLookingBarDotActive: {
    backgroundColor: "#D35C33"
  },
  crewGatewayLookingBarValue: {
    color: "rgba(255,249,239,0.76)",
    fontSize: 13,
    fontWeight: "800"
  },
  crewGatewayLookingBarValueActive: {
    color: "#FFF8EE"
  },
  crewGatewayOpenBar: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  crewGatewayOpenBarActive: {
    borderColor: "rgba(147,98,255,0.22)",
    backgroundColor: "rgba(147,98,255,0.06)"
  },
  crewGatewayOpenBarText: {
    color: "rgba(255,249,239,0.66)",
    fontSize: 14,
    fontWeight: "700",
    flex: 1
  },
  crewGatewayOpenBarTextActive: {
    color: "#D9C0FF"
  },
  crewGatewayOpenBarArrow: {
    color: "rgba(255,249,239,0.56)",
    fontSize: 26,
    lineHeight: 24,
    fontWeight: "500"
  },
  inboxSegmentRow: {
    flexDirection: "row",
    gap: 8
  },
  inboxSegmentChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  inboxSegmentChipActive: {
    backgroundColor: "rgba(211,92,51,0.12)",
    borderColor: "rgba(211,92,51,0.34)"
  },
  inboxSegmentText: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 11,
    fontWeight: "700"
  },
  inboxSegmentTextActive: {
    color: "#FFF8EE"
  },
  inboxCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 12,
    gap: 8
  },
  inboxCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8
  },
  inboxCardName: {
    color: "#FFF8EE",
    fontSize: 15,
    fontWeight: "700"
  },
  inboxCardMeta: {
    color: "rgba(255,249,239,0.65)",
    fontSize: 12
  },
  inboxBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.34)",
    backgroundColor: "rgba(211,92,51,0.12)",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  inboxBadgeText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700"
  },
  inboxCardBody: {
    color: "rgba(255,249,239,0.84)",
    lineHeight: 19
  },
  inboxEmpty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.015)",
    padding: 14,
    gap: 6
  },
  stackArea: {
    flex: 1,
    position: "relative",
    paddingTop: 8
  },
  loadingBlock: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  stackGhostCard: {
    position: "absolute",
    borderRadius: 26,
    backgroundColor: "#2A251D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    opacity: 0.9
  },
  primaryCard: {
    position: "relative",
    flex: 1,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#201C16",
    padding: 0,
    gap: 0,
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
  swipeBadgeText: {
    fontWeight: "800",
    fontSize: 12,
    color: "#FFF8EE"
  },
  photoStage: {
    backgroundColor: "#2A2218",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden"
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
  photoBottomFadeSoft: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "52%",
    backgroundColor: "rgba(7,7,8,0.16)"
  },
  photoBottomFadeStrong: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "34%",
    backgroundColor: "rgba(7,7,8,0.52)"
  },
  photoTopMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  eventPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(17,16,13,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: "72%"
  },
  eventPillText: {
    color: "#FFF8EE",
    ...theme.type.caption,
    fontWeight: "700"
  },
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
  photoTitle: {
    color: "#FFF8EE",
    ...theme.type.titleMd
  },
  photoSubtitle: {
    color: "rgba(255,249,239,0.75)",
    ...theme.type.caption
  },
  photoDistance: {
    color: "rgba(255,249,239,0.75)",
    ...theme.type.caption
  },
  emptyCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#1E1B16",
    padding: 16,
    justifyContent: "center",
    gap: 8
  },
  radarWrap: {
    alignSelf: "center",
    width: 164,
    height: 164,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8
  },
  radarCore: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#D35C33",
    zIndex: 5
  },
  radarRingStaticA: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)"
  },
  radarRingStaticB: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  radarPulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(211,92,51,0.48)"
  },
  radarNode: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,245,236,0.78)"
  },
  radarNodeA: {
    top: 44,
    right: 30
  },
  radarNodeB: {
    bottom: 30,
    left: 46
  },
  radarNodeC: {
    top: 30,
    left: 40,
    width: 6,
    height: 6,
    backgroundColor: "rgba(255,193,152,0.9)"
  },
  radarSweep: {
    position: "absolute",
    width: 120,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(211,92,51,0.35)",
    transform: [{ rotate: "-26deg" }]
  },
  emptyTitle: {
    color: "#FFF8EE",
    fontWeight: "700",
    fontSize: 18
  },
  emptyStatus: {
    color: "rgba(255,245,236,0.78)",
    ...theme.type.caption,
    fontWeight: "700"
  },
  emptyToggleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2
  },
  emptyToggleText: {
    flex: 1,
    color: "rgba(255,245,236,0.74)",
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
  cardBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8
  },
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
  inlineExpandedShell: {
    marginTop: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#0E0D0B",
    padding: 10,
    gap: 10
  },
  inlineExpandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2
  },
  inlineExpandedTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  cardSectionTitle: {
    color: "#E8DDCE",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  expandButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  expandButtonText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700"
  },
  reason: {
    color: "#FFC7B2",
    ...theme.type.caption,
    fontWeight: "600"
  },
  collapsedCardMeta: {
    gap: 10
  },
  collapsedCardMetaMain: {
    gap: 4
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
  collapsedBio: {
    color: "rgba(255,249,239,0.84)",
    lineHeight: 19,
    marginTop: 4
  },
  profileModalScreen: {
    flex: 1,
    backgroundColor: "#090807"
  },
  profileModalContainer: {
    paddingHorizontal: 12,
    gap: 10
  },
  profileModalTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 4
  },
  profileModalTopTitle: {
    color: "#FFF8EE",
    fontSize: 18,
    fontWeight: "800"
  },
  cleanFactsList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    overflow: "hidden"
  },
  showcasePill: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    gap: 12
  },
  showcaseGroup: {
    gap: 8
  },
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
  showcaseTileFooter: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(8,8,8,0.34)"
  },
  eventArtTitle: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15
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
  bio: {
    color: "rgba(255,249,239,0.8)",
    lineHeight: 19
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  tag: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  tagText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "600"
  },
  swipeHintText: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 11,
    textAlign: "center"
  },
  actionDisabled: {
    opacity: 0.7
  },
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
  contextLabelText: {
    color: "rgba(255,245,236,0.82)",
    ...theme.type.caption,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6
  },
  dockButton: {
    width: 62,
    height: 62,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1
  },
  dockActionButton: {
    minWidth: 118,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: 12
  },
  dockActionButtonGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.14)"
  },
  dockActionButtonPrimary: {
    backgroundColor: "#C24A22",
    borderColor: "#D35C33",
    shadowColor: "#C24A22",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 }
  },
  dockActionButtonGhostText: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "700"
  },
  dockActionButtonPrimaryText: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  dockButtonGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.14)"
  },
  dockButtonPrimary: {
    backgroundColor: "#C24A22",
    borderColor: "#D35C33",
    shadowColor: "#C24A22",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 }
  },
  dockButtonGhostText: {
    color: "#FFF8EE",
    fontSize: 28,
    fontWeight: "700",
    marginTop: -2
  },
  dockButtonPrimaryText: {
    color: "#FFF8EE",
    fontSize: 26,
    fontWeight: "700",
    marginTop: -1
  },
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
  dockMiniButtonMid: {
    transform: [{ translateY: -2 }]
  },
  dockMiniText: {
    color: "#F3D2C3",
    fontSize: 20,
    fontWeight: "700"
  },
  inlineProfileAnchor: {
    marginTop: 8
  },
  inlineProfileSheet: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#17140F",
    padding: 14,
    gap: 12
  },
  inlineProfileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
  },
  inlineEyebrow: {
    color: "rgba(255,249,239,0.55)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 4
  },
  inlineHeroMedia: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#221A12",
    minHeight: 220,
    overflow: "hidden",
    justifyContent: "space-between"
  },
  inlineHeroNoise: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#2D2117"
  },
  inlineHeroOverlayTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    padding: 12
  },
  inlineHeroOverlayBottom: {
    padding: 14,
    gap: 2,
    backgroundColor: "rgba(10,10,9,0.45)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  inlineHeroName: {
    color: "#FFF8EE",
    fontSize: 28,
    fontWeight: "800"
  },
  inlineHeroSubtitle: {
    color: "rgba(255,249,239,0.8)",
    fontSize: 14,
    fontWeight: "500"
  },
  modalTitle: {
    color: "#FFF8EE",
    ...theme.type.titleLg
  },
  modalSubtitle: {
    color: "rgba(255,249,239,0.72)",
    ...theme.type.caption
  },
  modalCloseButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  modalCloseButtonText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700"
  },
  modalHeroArt: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#241C13",
    minHeight: 120,
    padding: 12,
    justifyContent: "flex-end",
    overflow: "hidden"
  },
  modalHeroGlow: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 999,
    right: -18,
    top: -20,
    backgroundColor: "#C24A22",
    opacity: 0.24
  },
  modalEventName: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "700"
  },
  modalOverlap: {
    color: "#FFC7B2",
    ...theme.type.caption,
    marginTop: 2
  },
  modalSection: {
    gap: 6
  },
  modalFactsGrid: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    gap: 8
  },
  inlineTag: {
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  factLabel: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3
  },
  factValue: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    textAlign: "right"
  },
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
  modalEventList: {
    gap: 8
  },
  inlineEventCards: {
    gap: 8
  },
  inlineEventCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.025)",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  modalEventListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  modalEventDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.accent
  },
  modalEventText: {
    color: "#EADFD0",
    fontSize: 13
  },
  modalFooter: {
    flexDirection: "row",
    gap: 10
  },
  inlineStickyFooter: {
    marginTop: 2,
    marginBottom: -2,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 10
  },
  inlineFooterHint: {
    color: "rgba(255,249,239,0.58)",
    fontSize: 11,
    textAlign: "center"
  },
  modalAction: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center"
  },
  modalActionGhost: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  modalActionPrimary: {
    borderColor: "#D35C33",
    backgroundColor: "#C24A22"
  },
  modalActionGhostText: {
    color: "#FFF8EE",
    fontWeight: "700"
  },
  modalActionPrimaryText: {
    color: "#FFF8EE",
    fontWeight: "700"
  }
});
