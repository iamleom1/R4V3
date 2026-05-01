import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Slider from "@react-native-community/slider";
import * as Location from "expo-location";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../app/AppProvider";
import { RemoteImage, prefetchRemoteImages } from "../../components/RemoteImage";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";
import type { EventRecord, RSVPStatus } from "../../types/domain";
import {
  hasEventCrewChat,
  listEventAudienceMetrics,
  listUpcomingEvents
} from "./eventRepository";
import { getEventLocationSummary } from "./eventLocation";
import { captureCurrentDeviceLocation } from "../profile/deviceLocationService";
import type { DiscoverStackParamList } from "./DiscoverNavigator";
import { useEventRsvpState } from "./useEventRsvpState";

type Props = NativeStackScreenProps<DiscoverStackParamList, "DiscoverHome">;
type AddEventStep = "choice" | "organizer" | "form" | "success";
type AddEventFlowType = "community" | "promoter" | null;
type DiscoverSortTab = "top" | "this_weekend" | "nearest" | "most_active" | "soonest";
type DiscoverGenreFilter = "all" | (typeof EVENT_GENRE_OPTIONS)[number];

const EVENT_GENRE_OPTIONS = ["Afters", "House", "Tech House", "Techno", "Hard Techno", "Dubstep", "Trance", "Drum & Bass", "Hardstyle", "Bass"];
const DISCOVER_PREVIEW_LIMIT = 20;
const DISCOVER_PAGE_SIZE = 20;
const RADIUS_OPTIONS = [
  { label: "25 mi", value: 25 },
  { label: "50 mi", value: 50 },
  { label: "100 mi", value: 100 },
  { label: "All SoCal", value: null }
] as const;
const DISCOVER_SORT_OPTIONS: Array<{ key: DiscoverSortTab; label: string }> = [
  { key: "top", label: "🔥 Top" },
  { key: "nearest", label: "📍 Nearest" },
  { key: "most_active", label: "⚡ Most Active" },
  { key: "soonest", label: "⏰ Starting Soon" },
  { key: "this_weekend", label: "📅 This Weekend" }
];
const DISCOVER_SORT_GROUPS: Array<{ title: string; options: Array<{ key: DiscoverSortTab; label: string }> }> = [
  {
    title: "Sort by:",
    options: [
      { key: "top", label: "🔥 Top" },
      { key: "most_active", label: "⚡ Most Active" },
      { key: "nearest", label: "📍 Nearest" }
    ]
  },
  {
    title: "Filter by:",
    options: [
      { key: "this_weekend", label: "📅 This Weekend" },
      { key: "soonest", label: "⏰ Starting Soon" }
    ]
  }
];

const RUNTIME_CITY_CENTERS: Record<string, { lat: number; lng: number }> = {};
const RUNTIME_CITY_CENTER_MISSES = new Set<string>();
const LOS_ANGELES_CENTER = { lat: 34.0522, lng: -118.2437 };
const LA_FALLBACK_MIN_RESULTS = 18;

export function EventDiscoveryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width;
  const gridGap = 12;
  const horizontalPadding = 32;
  const eventGridColumns = screenWidth >= 360 ? 2 : 1;
  const wideCardWidth =
    eventGridColumns === 2
      ? Math.floor((screenWidth - horizontalPadding - gridGap) / 2)
      : Math.max(280, Math.floor(screenWidth - horizontalPadding));
  const { session, profileDraft, updateProfileDraft, saveProfileDraft } = useAppState();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const { rsvps, setRsvp, refreshRsvps } = useEventRsvpState(session?.user?.id ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);
  const [selectedRadiusMiles, setSelectedRadiusMiles] = useState<number | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<DiscoverGenreFilter>("all");
  const [activeSortTab, setActiveSortTab] = useState<DiscoverSortTab>("top");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [, setResolvedCityCentersVersion] = useState(0);
  const [audienceMetrics, setAudienceMetrics] = useState<Record<string, { goingCount: number; lookingForCrewCount: number }>>({});
  const [stableRankedEventIds, setStableRankedEventIds] = useState<string[]>([]);
  const [activePreviewEventId, setActivePreviewEventId] = useState<string | null>(null);
  const previewNoticeShownRef = useRef(false);

  const viewerLocation = useMemo(() => {
    if (typeof profileDraft.locationLat === "number" && typeof profileDraft.locationLng === "number") {
      return { lat: profileDraft.locationLat, lng: profileDraft.locationLng };
    }
    if (profileDraft.city.trim()) {
      return getCityCenter(profileDraft.city.trim());
    }
    return null;
  }, [profileDraft.city, profileDraft.locationLat, profileDraft.locationLng]);
  const filteredEvents = useMemo(() => {
    const upcomingEvents = events.filter((event) => isDiscoverableUpcomingEvent(event) && isSceneRelevantDiscoveryEvent(event));
    const genreFilteredEvents =
      selectedGenre === "all"
        ? upcomingEvents
        : upcomingEvents.filter((event) => event.genreTags?.some((tag) => normalizeGenreTag(tag) === normalizeGenreTag(selectedGenre)));

    if (!viewerLocation) {
      return genreFilteredEvents.filter((event) => {
        const distance = getEventDistanceMiles(event, LOS_ANGELES_CENTER);
        return distance !== null && distance <= 100;
      });
    }

    if (selectedRadiusMiles === null) {
      return genreFilteredEvents;
    }

    const nearby = genreFilteredEvents.filter((event) => {
      const distance = getEventDistanceMiles(event, viewerLocation);
      return distance !== null && distance <= selectedRadiusMiles;
    });

    if (nearby.length >= LA_FALLBACK_MIN_RESULTS) {
      return nearby;
    }

    const nearbyIds = new Set(nearby.map((event) => event.id));
    const laFallback = genreFilteredEvents.filter((event) => {
      if (nearbyIds.has(event.id)) {
        return false;
      }
      const distance = getEventDistanceMiles(event, LOS_ANGELES_CENTER);
      return distance !== null && distance <= 100;
    });

    return [...nearby, ...laFallback];
  }, [events, selectedGenre, selectedRadiusMiles, viewerLocation]);
  const rankedFilteredEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) =>
      compareEventsForDiscoveryTab(
        a,
        b,
        activeSortTab,
        audienceMetrics,
        viewerLocation
      )
    );
  }, [activeSortTab, audienceMetrics, filteredEvents, viewerLocation]);
  const rankingSignature = useMemo(
    () =>
      JSON.stringify({
        genre: selectedGenre,
        sort: activeSortTab,
        radius: selectedRadiusMiles
      }),
    [activeSortTab, selectedGenre, selectedRadiusMiles]
  );
  const visibleRankedEvents = useMemo(() => {
    const eventMap = new Map(rankedFilteredEvents.map((event) => [event.id, event]));
    const ordered = stableRankedEventIds.map((id) => eventMap.get(id)).filter(Boolean) as EventRecord[];
    return ordered;
  }, [rankedFilteredEvents, stableRankedEventIds]);
  const citySearchSummary = useMemo(() => {
    if (!viewerLocation) {
      return "Showing Los Angeles events by default.";
    }
    return `Showing events within ${selectedRadiusMiles} miles of your location.`;
  }, [selectedRadiusMiles, viewerLocation]);
  const activeLocationTitle = useMemo(() => {
    if (!viewerLocation) {
      return "Los Angeles • Default";
    }
    return `Current Location • ${selectedRadiusMiles} mi`;
  }, [selectedRadiusMiles, viewerLocation]);
  const activeLocationMeta = useMemo(() => {
    if (!viewerLocation) {
      return `${filteredEvents.length} LA events`;
    }
    return `${filteredEvents.length} in range`;
  }, [filteredEvents.length, selectedRadiusMiles, viewerLocation]);
  const viewerLocationLabel = useMemo(() => {
    const city = profileDraft.city.trim();
    if (city) {
      return city;
    }
    return "Location unavailable";
  }, [profileDraft.city]);
  const radiusSliderValue = useMemo(() => {
    const index = RADIUS_OPTIONS.findIndex((option) => option.value === selectedRadiusMiles);
    return index >= 0 ? index : 1;
  }, [selectedRadiusMiles]);
  const weekendEvents = useMemo(() => getClosestWeekendEvents(events, audienceMetrics, viewerLocation), [audienceMetrics, events, viewerLocation]);
  const featuredEvents = useMemo(
    () =>
      rankedFilteredEvents
        .filter((event) => isEventCurrentlyFeatured(event))
        .sort((a, b) => compareFeaturedEvents(a, b, viewerLocation))
        .slice(0, 6),
    [rankedFilteredEvents, viewerLocation]
  );
  const weekendCarouselEvents = useMemo(
    () => (weekendEvents.length > 1 ? [...weekendEvents, weekendEvents[0]] : weekendEvents),
    [weekendEvents]
  );
  const weekendCardWidth = Math.max(304, Math.floor(screenWidth - 32));
  const weekendGap = 10;
  const weekendRailRef = useRef<ScrollView | null>(null);
  const [weekendIndex, setWeekendIndex] = useState(0);
  const [weekendAutoRotateEnabled, setWeekendAutoRotateEnabled] = useState(true);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [showLocationFilterModal, setShowLocationFilterModal] = useState(false);
  const [addEventStep, setAddEventStep] = useState<AddEventStep>("choice");
  const [addEventFlowType, setAddEventFlowType] = useState<AddEventFlowType>(null);
  const [organizerBrandName, setOrganizerBrandName] = useState("");
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [organizerSocial, setOrganizerSocial] = useState("");
  const [requestVerification, setRequestVerification] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventDateTime, setEventDateTime] = useState("");
  const [eventCity, setEventCity] = useState("");
  const [useManualVenue, setUseManualVenue] = useState(false);
  const [eventVenue, setEventVenue] = useState("");
  const [selectedGenreTags, setSelectedGenreTags] = useState<string[]>([]);
  const [eventFlyer, setEventFlyer] = useState("");
  const [eventLink, setEventLink] = useState("");
  const [eventConfirmReal, setEventConfirmReal] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const lastEventDiscoveryFetchAtRef = useRef(0);
  const loadedEventCountRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const hasMoreEventsRef = useRef(true);
  const hasStartedDiscoveryScrollRef = useRef(false);
  const lastLoadMoreStartedAtRef = useRef(0);
  const loadMoreHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sortSelectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortSelectionFeedbackKey, setSortSelectionFeedbackKey] = useState<DiscoverSortTab | null>(null);

  const loadEventDiscovery = useCallback(
    async ({ reset = false, showSpinner = false, refreshing = false } = {}) => {
      if (showSpinner && reset) {
        setIsLoading(true);
      }
      if (refreshing) {
        setIsRefreshing(true);
      }
      if (!reset && hasMoreEventsRef.current) {
        isLoadingMoreRef.current = true;
        lastLoadMoreStartedAtRef.current = Date.now();
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        if (reset) {
          const eventRows = await listUpcomingEvents(DISCOVER_PREVIEW_LIMIT, 0);
          setEvents(eventRows);
          loadedEventCountRef.current = eventRows.length;
          const nextHasMore = eventRows.length === DISCOVER_PREVIEW_LIMIT;
          hasMoreEventsRef.current = nextHasMore;
          setHasMoreEvents(nextHasMore);
        } else {
          const eventRows = await listUpcomingEvents(DISCOVER_PAGE_SIZE, loadedEventCountRef.current);
          setEvents((prev) => {
            const merged = new Map(prev.map((event) => [event.id, event]));
            for (const event of eventRows) {
              merged.set(event.id, event);
            }
            return Array.from(merged.values());
          });
          loadedEventCountRef.current += eventRows.length;
          const nextHasMore = eventRows.length === DISCOVER_PAGE_SIZE;
          hasMoreEventsRef.current = nextHasMore;
          setHasMoreEvents(nextHasMore);
        }
        lastEventDiscoveryFetchAtRef.current = Date.now();
      } catch (e) {
        setError(toUserFacingError(e, "Failed to load events."));
      } finally {
        if (showSpinner && reset) {
          setIsLoading(false);
        }
        if (refreshing) {
          setIsRefreshing(false);
        }
        if (!reset) {
          isLoadingMoreRef.current = false;
          if (loadMoreHideTimeoutRef.current) {
            clearTimeout(loadMoreHideTimeoutRef.current);
          }
          const elapsed = Date.now() - lastLoadMoreStartedAtRef.current;
          const remaining = Math.max(0, 240 - elapsed);
          loadMoreHideTimeoutRef.current = setTimeout(() => {
            requestAnimationFrame(() => {
              setIsLoadingMore(false);
            });
          }, remaining);
        }
      }
    },
    []
  );

  const handlePullToRefresh = useCallback(async () => {
    loadedEventCountRef.current = 0;
    hasMoreEventsRef.current = true;
    hasStartedDiscoveryScrollRef.current = false;
    await loadEventDiscovery({ reset: true, showSpinner: false, refreshing: true });
  }, [loadEventDiscovery]);

  useEffect(() => {
    void loadEventDiscovery({ reset: true, showSpinner: true });
  }, [loadEventDiscovery]);

  useEffect(() => {
    return () => {
      if (loadMoreHideTimeoutRef.current) {
        clearTimeout(loadMoreHideTimeoutRef.current);
      }
      if (sortSelectionTimeoutRef.current) {
        clearTimeout(sortSelectionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCityCenters() {
      const cityCandidates = Array.from(
        new Set(
          [profileDraft.city, ...events.map((event) => event.city)]
            .map((city) => city?.trim() ?? "")
            .filter(Boolean)
        )
      );

      let resolvedAny = false;
      for (const city of cityCandidates) {
        const normalized = normalizeCityKey(city);
        if (!normalized || getCityCenter(city) || RUNTIME_CITY_CENTER_MISSES.has(normalized)) {
          continue;
        }

        try {
          const results = await Location.geocodeAsync(city);
          const first = results[0];
          if (cancelled) {
            return;
          }
          if (typeof first?.latitude === "number" && typeof first?.longitude === "number") {
            RUNTIME_CITY_CENTERS[normalized] = { lat: first.latitude, lng: first.longitude };
            resolvedAny = true;
          } else {
            RUNTIME_CITY_CENTER_MISSES.add(normalized);
          }
        } catch {
          RUNTIME_CITY_CENTER_MISSES.add(normalized);
        }
      }

      if (!cancelled && resolvedAny) {
        setResolvedCityCentersVersion((value) => value + 1);
      }
    }

    void hydrateCityCenters();
    return () => {
      cancelled = true;
    };
  }, [events, profileDraft.city]);

  const handleUseCurrentLocation = useCallback(async () => {
    setIsLocating(true);
    try {
      const result = await captureCurrentDeviceLocation();
      if (!result.ok) {
        Alert.alert("Couldn’t get location", result.error);
        return;
      }

      const nextDraft = {
        ...profileDraft,
        city: result.location.city ?? profileDraft.city,
        locationLat: result.location.latitude,
        locationLng: result.location.longitude,
        locationAccuracyMeters: result.location.accuracyMeters,
        locationCapturedAt: result.location.capturedAt
      };
      updateProfileDraft(nextDraft);
      setSelectedRadiusMiles((current) => current ?? 25);
      await saveProfileDraft({ draftOverride: nextDraft });
    } finally {
      setIsLocating(false);
    }
  }, [profileDraft, saveProfileDraft, updateProfileDraft]);

  const lastRankingSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    setStableRankedEventIds((prev) => {
      const nextIds = rankedFilteredEvents.map((event) => event.id);
      if (lastRankingSignatureRef.current !== rankingSignature) {
        lastRankingSignatureRef.current = rankingSignature;
        return nextIds;
      }

      const nextIdSet = new Set(nextIds);
      const kept = prev.filter((id) => nextIdSet.has(id));
      const keptSet = new Set(kept);
      const appended = nextIds.filter((id) => !keptSet.has(id));
      return [...kept, ...appended];
    });
  }, [rankedFilteredEvents, rankingSignature]);

  useEffect(() => {
    prefetchRemoteImages(
      visibleRankedEvents
        .slice(0, Math.min(visibleRankedEvents.length, DISCOVER_PREVIEW_LIMIT + DISCOVER_PAGE_SIZE))
        .map((event) => event.flyerUrl)
    );
  }, [visibleRankedEvents]);

  useEffect(() => {
    if (isLoading || isLoadingMoreRef.current || !hasMoreEventsRef.current) {
      return;
    }

    if (rankedFilteredEvents.length >= DISCOVER_PREVIEW_LIMIT) {
      return;
    }

    void loadEventDiscovery({ reset: false, showSpinner: false });
  }, [isLoading, loadEventDiscovery, rankedFilteredEvents.length]);

  useEffect(() => {
    let active = true;

    async function loadMetrics() {
      const metrics = await listEventAudienceMetrics(events.map((event) => event.id));
      if (!active) return;
      setAudienceMetrics(metrics);
    }

    void loadMetrics();
    return () => {
      active = false;
    };
  }, [events]);

  const handleMusicPreviewPress = useCallback(async (event: EventRecord) => {
    if (!event.musicPreviewUrl?.trim()) {
      return;
    }

    setActivePreviewEventId((current) => (current === event.id ? null : event.id));

    if (!previewNoticeShownRef.current) {
      previewNoticeShownRef.current = true;
      Alert.alert(
        "Preview pending dev build",
        "The in-app play control is in place, but inline audio playback needs a dev build instead of Expo Go."
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Keep card RSVP state in sync after actions taken on detail screen.
      void refreshRsvps();
      const hasEvents = events.length > 0;
      const isStale = Date.now() - lastEventDiscoveryFetchAtRef.current > 30_000;
      if (!hasEvents || isStale) {
        loadedEventCountRef.current = 0;
        hasMoreEventsRef.current = true;
        hasStartedDiscoveryScrollRef.current = false;
        void loadEventDiscovery({ reset: true, showSpinner: !hasEvents });
      }
    }, [events.length, loadEventDiscovery, refreshRsvps])
  );

  const handleDiscoveryScroll = useCallback(
    (event: any) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      if (!hasStartedDiscoveryScrollRef.current) {
        return;
      }

      if (contentSize.height <= layoutMeasurement.height * 1.1) {
        return;
      }

      const threshold = contentSize.height * 0.8;
      const viewportBottom = contentOffset.y + layoutMeasurement.height;

      if (
        viewportBottom < threshold ||
        isLoading ||
        isLoadingMoreRef.current ||
        !hasMoreEventsRef.current ||
        Date.now() - lastLoadMoreStartedAtRef.current < 500
      ) {
        return;
      }

      void loadEventDiscovery({ reset: false, showSpinner: false });
    },
    [isLoading, loadEventDiscovery]
  );

  useEffect(() => {
    setWeekendIndex(0);
    setWeekendAutoRotateEnabled(true);
    requestAnimationFrame(() => {
      weekendRailRef.current?.scrollTo({ x: 0, animated: false });
    });
  }, [weekendEvents.length]);

  useEffect(() => {
    if (!weekendAutoRotateEnabled || weekendEvents.length <= 1) return;
    const timer = setTimeout(() => {
      const next = weekendIndex + 1;
      setWeekendIndex(next);
      weekendRailRef.current?.scrollTo({ x: next * (weekendCardWidth + weekendGap), animated: true });
    }, 5000);
    return () => clearTimeout(timer);
  }, [weekendAutoRotateEnabled, weekendCardWidth, weekendEvents.length, weekendGap, weekendIndex]);

  function pauseWeekendAutoRotate() {
    if (weekendAutoRotateEnabled) {
      setWeekendAutoRotateEnabled(false);
    }
  }

  async function handleRsvp(eventId: string, status: RSVPStatus) {
    if (!session?.user?.id) {
      const rootNav: any = navigation.getParent()?.getParent();
      rootNav?.navigate?.("Auth");
      return;
    }

    try {
      setIsSavingId(eventId);
      setError(null);

      const result = await setRsvp(eventId, status);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const metrics = await listEventAudienceMetrics([eventId]);
      setAudienceMetrics((prev) => ({ ...prev, ...metrics }));
    } catch (error) {
      setError(toUserFacingError(error, "Couldn’t update your RSVP."));
    } finally {
      setIsSavingId(null);
    }
  }

  async function confirmThenUnattend(eventId: string) {
    if (!session?.user?.id) {
      void handleRsvp(eventId, "none");
      return;
    }

    const inCrewChat = await hasEventCrewChat(session.user.id, eventId);
    const message = inCrewChat
      ? "You’ll exit this event and be removed from your crew chat."
      : "You’ll be removed from crew matching for this event.";

    Alert.alert("Leave Event?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave Event",
        style: "destructive",
        onPress: () => {
          void handleRsvp(eventId, "none");
        }
      }
    ]);
  }

  function hasAddEventDraft() {
    return Boolean(
      organizerBrandName.trim() ||
        organizerEmail.trim() ||
        organizerSocial.trim() ||
        eventName.trim() ||
        eventDateTime.trim() ||
        eventCity.trim() ||
        eventVenue.trim() ||
        eventFlyer.trim() ||
        eventLink.trim()
    );
  }

  function resetAddEventDraft() {
    setAddEventStep("choice");
    setAddEventFlowType(null);
    setOrganizerBrandName("");
    setOrganizerEmail("");
    setOrganizerSocial("");
    setRequestVerification(false);
    setEventName("");
    setEventDateTime("");
    setEventCity("");
    setUseManualVenue(false);
    setEventVenue("");
    setSelectedGenreTags([]);
    setEventFlyer("");
    setEventLink("");
    setEventConfirmReal(false);
    setShowOptionalDetails(false);
  }

  function dismissAddEventModal() {
    if (!hasAddEventDraft()) {
      setAddEventStep("choice");
      setAddEventFlowType(null);
      setShowAddEventModal(false);
      return;
    }
    Alert.alert("Close Add Event?", "Keep your draft for later or discard it.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Close & keep draft",
        onPress: () => {
          // Reopen from main options, while preserving form draft fields.
          setAddEventStep("choice");
          setAddEventFlowType(null);
          setShowAddEventModal(false);
        }
      },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          resetAddEventDraft();
          setShowAddEventModal(false);
        }
      }
    ]);
  }

  function selectAddEventFlow(nextFlow: Exclude<AddEventFlowType, null>) {
    setAddEventFlowType(nextFlow);
    setAddEventStep(nextFlow === "community" ? "form" : "organizer");
  }

  function continueToPromoterForm() {
    if (!organizerBrandName.trim() || !organizerEmail.trim()) {
      Alert.alert("Missing details", "Organizer/Brand Name and Contact Email are required.");
      return;
    }
    setAddEventStep("form");
  }

  function toggleGenreTag(tag: string) {
    setSelectedGenreTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  }

  function submitAddEvent() {
    if (!eventName.trim() || !eventDateTime.trim() || !eventCity.trim() || !eventVenue.trim() || selectedGenreTags.length === 0) {
      Alert.alert("Missing essentials", "Complete Event Name, Date & Start Time, City, Venue, and at least one genre tag.");
      return;
    }
    if (!eventConfirmReal) {
      Alert.alert("Confirmation needed", "Confirm this is a real event before submitting.");
      return;
    }
    setAddEventStep("success");
  }

  function handleOpenAddEvent() {
    if (!session?.user?.id) {
      const rootNav: any = navigation.getParent()?.getParent();
      rootNav?.navigate?.("Auth", { intent: "gated_action", authPrompt: "Sign in to submit an event listing." });
      return;
    }
    // Always open on the main entry choices so users can pick a path.
    setAddEventStep("choice");
    setAddEventFlowType(null);
    setShowAddEventModal(true);
  }

  function handleSelectSortOption(nextSort: DiscoverSortTab) {
    if (sortSelectionTimeoutRef.current) {
      clearTimeout(sortSelectionTimeoutRef.current);
    }
    setActiveSortTab(nextSort);
    setSortSelectionFeedbackKey(nextSort);
    sortSelectionTimeoutRef.current = setTimeout(() => {
      setSortSelectionFeedbackKey(null);
      setIsSortDropdownOpen(false);
    }, 130);
  }

  return (
    <View style={styles.screenRoot}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: Math.max(insets.top + 8, 22) }]}
        onScrollBeginDrag={() => {
          hasStartedDiscoveryScrollRef.current = true;
          pauseWeekendAutoRotate();
        }}
        onScroll={handleDiscoveryScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handlePullToRefresh()}
            tintColor={theme.colors.accent}
            progressBackgroundColor="#1A1712"
          />
        }
      >
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderBrandRow}>
          <Text style={styles.pageHeaderBrand}>R4V3</Text>
          <View style={styles.pageHeaderDot} />
        </View>
        <Pressable style={styles.addEventButton} onPress={handleOpenAddEvent}>
          <Text style={styles.addEventButtonText}>Add Event</Text>
        </Pressable>
      </View>

      <View style={styles.weekendSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>🔥 Top Picks This Weekend</Text>
          <Text style={styles.sectionMeta}>{weekendEvents.length} events</Text>
        </View>
        <Text style={styles.weekendSubtitle}>Best events this weekend.</Text>
        <ScrollView
          ref={weekendRailRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={weekendCardWidth + weekendGap}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={styles.weekendRail}
          onScrollBeginDrag={pauseWeekendAutoRotate}
          onTouchStart={pauseWeekendAutoRotate}
          onMomentumScrollEnd={(event) => {
            const x = event.nativeEvent.contentOffset.x;
            const next = Math.round(x / (weekendCardWidth + weekendGap));
            if (weekendEvents.length > 1 && next >= weekendEvents.length) {
              setWeekendIndex(0);
              requestAnimationFrame(() => {
                weekendRailRef.current?.scrollTo({ x: 0, animated: false });
              });
              return;
            }
            setWeekendIndex(Math.max(0, Math.min(Math.max(weekendCarouselEvents.length - 1, 0), next)));
          }}
        >
          {weekendCarouselEvents.map((event, idx) => {
            const palette = getWeekendBannerPalette(event, idx);
            return (
              <Pressable
                key={`wknd-${event.id}-${idx}`}
                style={[styles.weekendCard, { backgroundColor: palette.base, width: weekendCardWidth }]}
                onPress={() => {
                  pauseWeekendAutoRotate();
                  navigation.navigate("WeekendEvents", { weekendEvents, selectedEventId: event.id });
                }}
              >
                <FlyerSurface
                  uri={event.flyerUrl}
                  imageStyle={styles.weekendFlyerImage}
                  fallback={
                    <>
                      <View style={[styles.weekendGlowA, { backgroundColor: palette.glowA }]} />
                      <View style={[styles.weekendGlowB, { backgroundColor: palette.glowB }]} />
                      <View style={[styles.weekendBeam, { backgroundColor: palette.lineA, transform: [{ rotate: "-8deg" }] }]} />
                      <View style={[styles.weekendBeam, styles.weekendBeamAlt, { backgroundColor: palette.lineB, transform: [{ rotate: "7deg" }] }]} />
                    </>
                  }
                >
                  {event.flyerUrl ? <View style={styles.weekendFlyerOverlay} /> : null}
                </FlyerSurface>
                <Text style={styles.weekendDay}>{formatWeekendDay(event.startsAt)}</Text>
                <Text style={styles.weekendTitle} numberOfLines={2}>{event.title}</Text>
                <Text style={styles.weekendMeta} numberOfLines={1}>{getEventLocationSummary(event)} • {formatEventDate(event.startsAt)}</Text>
                <View style={styles.weekendActionPill}>
                  <Text style={styles.weekendActionText}>View weekend lineup</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        {weekendEvents.length > 1 ? <View style={styles.weekendCarouselDot} /> : null}
        {error ? (
          <View style={styles.errorInlineCard}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.errorInlineButton} onPress={() => void loadEventDiscovery({ reset: true, showSpinner: true })}>
              <Text style={styles.errorInlineButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.genreSection}>
        {featuredEvents.length > 0 ? (
          <View style={styles.featuredSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Featured Picks</Text>
              <Text style={styles.sectionMeta}>{featuredEvents.length} curated</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRail}>
              {featuredEvents.map((event, idx) => {
                const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
                const palette = getWeekendBannerPalette(event, idx);
                const distanceAway = viewerLocation ? getEventDistanceMiles(event, viewerLocation) : null;
                const audienceSummary = formatAudienceSummary(metrics);
                return (
                  <Pressable
                    key={`featured-${event.id}`}
                    style={styles.featuredCard}
                    onPress={() => navigation.navigate("EventDetail", { event })}
                  >
                    <FlyerSurface
                      uri={event.flyerUrl}
                      imageStyle={styles.featuredImage}
                      fallback={
                        <View style={[styles.featuredImageFallback, { backgroundColor: palette.base }]}>
                          <View style={[styles.weekendGlowA, { backgroundColor: palette.glowA }]} />
                          <View style={[styles.weekendGlowB, { backgroundColor: palette.glowB }]} />
                          <View style={[styles.weekendBeam, { backgroundColor: palette.lineA, transform: [{ rotate: "-8deg" }] }]} />
                          <View style={[styles.weekendBeam, styles.weekendBeamAlt, { backgroundColor: palette.lineB, transform: [{ rotate: "7deg" }] }]} />
                        </View>
                      }
                    />
                    <View style={styles.featuredOverlay} />
                    <View style={styles.featuredBody}>
                      <View style={styles.featuredPill}>
                        <Text style={styles.featuredPillText}>R4V3 PICK</Text>
                      </View>
                      <Text style={styles.featuredTitle} numberOfLines={2}>{event.title}</Text>
                      <Text style={styles.featuredMeta} numberOfLines={1}>
                        {[getEventLocationSummary(event), formatEventDate(event.startsAt)].join(" • ")}
                      </Text>
                      {distanceAway !== null ? (
                        <Text style={styles.distanceMeta} numberOfLines={1}>{formatDistanceAway(distanceAway)}</Text>
                      ) : null}
                      {audienceSummary ? (
                        <Text style={styles.featuredSubmeta} numberOfLines={1}>
                          {audienceSummary}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.discoveryControlRow}>
          <View style={styles.sectionHeaderRowCompact}>
            <Text style={styles.sectionTitle}>Browse by genre</Text>
            <Text style={styles.sectionMeta}>{selectedGenre === "all" ? "All events" : selectedGenre}</Text>
          </View>
          <Pressable
            style={styles.locationTrigger}
            accessibilityRole="button"
            accessibilityLabel="Open location filter"
            onPress={() => setShowLocationFilterModal(true)}
          >
            <Text style={styles.locationTriggerGlyphText}>⌖</Text>
            <Text style={styles.locationTriggerValue} numberOfLines={1}>
              {activeLocationTitle}
            </Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRail}>
          <Pressable
            style={[styles.genreChip, selectedGenre === "all" && styles.genreChipActive]}
            onPress={() => setSelectedGenre("all")}
          >
            <Text style={[styles.genreChipText, selectedGenre === "all" && styles.genreChipTextActive]}>All</Text>
          </Pressable>
          {EVENT_GENRE_OPTIONS.map((genre) => {
            const selected = selectedGenre === genre;
            return (
              <Pressable
                key={genre}
                style={[styles.genreChip, selected && styles.genreChipActive]}
                onPress={() => setSelectedGenre(genre)}
              >
                <Text style={[styles.genreChipText, selected && styles.genreChipTextActive]}>{genre}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Upcoming events</Text>
        <View style={styles.upcomingHeaderActions}>
          <Pressable style={styles.sortDropdownTrigger} onPress={() => setIsSortDropdownOpen(true)}>
            <Text style={styles.sortDropdownTriggerText}>
              {`Sort: ${DISCOVER_SORT_OPTIONS.find((option) => option.key === activeSortTab)?.label ?? "🔥 Top"}`}
            </Text>
            <Text style={styles.sortDropdownTriggerGlyph}>▾</Text>
          </Pressable>
          <Text style={styles.sectionMeta}>{isLoading ? "Loading" : rankedFilteredEvents.length > 0 ? `${rankedFilteredEvents.length} shown` : "No events"}</Text>
        </View>
      </View>
      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.body}>Loading events...</Text>
        </View>
      ) : null}

      <View style={styles.eventCardList}>
        {visibleRankedEvents.map((event, idx) => {
          const currentRsvp = rsvps[event.id];
          const saving = isSavingId === event.id;
          const palette = getEventTilePalette(event, idx);
          const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
          const distanceAway = viewerLocation ? getEventDistanceMiles(event, viewerLocation) : null;
          const goingCount = metrics.goingCount;
          const crewCount = metrics.lookingForCrewCount;
          const listingLabel = getEventListingLabel(event);
          const hasAudienceMetrics = goingCount > 0 || crewCount > 0;
          return (
            <View
              key={event.id}
              style={[
                styles.eventCardShell,
                { width: wideCardWidth },
                eventGridColumns === 2 && styles.eventCardShellHalf
              ]}
            >
              <Pressable
                style={[styles.eventCard, { width: wideCardWidth }, eventGridColumns === 2 && styles.eventCardCompact]}
                onPress={() => navigation.navigate("EventDetail", { event })}
              >
                <View style={[styles.eventPoster, { backgroundColor: palette.base }]}>
                  <FlyerSurface
                    uri={event.flyerUrl}
                    imageStyle={styles.eventPosterFlyerImage}
                    fallback={
                      <>
                        <View style={[styles.tileGlow, { backgroundColor: palette.glow }]} />
                        <View style={[styles.eventPosterGlowBottom, { backgroundColor: palette.glow }]} />
                        <View style={[styles.tileBeam, { backgroundColor: palette.beamA, transform: [{ rotate: "-14deg" }] }]} />
                        <View style={[styles.tileBeam, styles.tileBeamAlt, { backgroundColor: palette.beamB, transform: [{ rotate: "12deg" }] }]} />
                        <View style={[styles.tileBeamThin, { backgroundColor: palette.line }]} />
                        <View style={styles.eventPosterGrid} />
                      </>
                    }
                  >
                    {event.flyerUrl ? <View style={styles.eventPosterFlyerOverlay} /> : null}
                    {event.flyerUrl ? <View style={styles.eventPosterBottomScrim} /> : null}
                  </FlyerSurface>
                  <View style={styles.eventPosterTopRow}>
                    <View style={styles.eventPosterGenrePill}>
                      <Text style={styles.eventPosterGenrePillText}>
                        {((event.genreTags ?? [])[0] ?? "EDM").toUpperCase()}
                      </Text>
                    </View>
                    {event.musicPreviewUrl ? (
                      <Pressable
                        style={[
                          styles.eventPosterPreviewButton,
                          activePreviewEventId === event.id && styles.eventPosterPreviewButtonActive
                        ]}
                        onPress={(pressEvent) => {
                          pressEvent.stopPropagation();
                          void handleMusicPreviewPress(event);
                        }}
                      >
                        <Text style={styles.eventPosterPreviewButtonGlyph}>
                          {activePreviewEventId === event.id ? "❚❚" : "▶"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.eventPosterBottom}>
                    <Text style={[styles.eventPosterTitle, eventGridColumns === 2 && styles.eventPosterTitleCompact]} numberOfLines={2}>
                      {event.title}
                    </Text>
                    <Text style={styles.eventListingLabel} numberOfLines={1}>
                      {listingLabel}
                    </Text>
                    <View style={styles.eventPosterMetaRow}>
                      <Text style={styles.eventPosterMetaIcon}>⌖</Text>
                      <Text
                        style={[
                          styles.eventPosterMetaText,
                          styles.eventPosterMetaTextCity,
                          eventGridColumns === 2 && styles.eventPosterMetaTextCompact
                        ]}
                        numberOfLines={1}
                      >
                        {getEventLocationSummary(event)}
                      </Text>
                      <Text style={styles.eventPosterMetaDot}>•</Text>
                      <Text
                        style={[
                          styles.eventPosterMetaText,
                          styles.eventPosterMetaTextDate,
                          eventGridColumns === 2 && styles.eventPosterMetaTextCompact
                        ]}
                        numberOfLines={1}
                      >
                        {formatEventDate(event.startsAt)}
                      </Text>
                    </View>
                    {distanceAway !== null ? <Text style={styles.distanceMeta}>{formatDistanceAway(distanceAway)}</Text> : null}
                  </View>
                </View>
                <View style={[styles.eventCardBody, eventGridColumns === 2 && styles.eventCardBodyCompact]}>
                  {hasAudienceMetrics ? (
                    <View style={styles.eventMetricsRow}>
                      {goingCount > 0 ? (
                        <View style={styles.eventMetricPrimary}>
                          <Text style={[styles.eventMetricPrimaryText, eventGridColumns === 2 && styles.eventMetricPrimaryTextCompact]}>
                            {goingCount} going
                          </Text>
                        </View>
                      ) : null}
                      {goingCount > 0 && crewCount > 0 ? <View style={styles.eventMetricDivider} /> : null}
                      {crewCount > 0 ? (
                        <View style={[styles.eventMetricSecondary, eventGridColumns === 2 && styles.eventMetricSecondaryCompact]}>
                          <Text style={[styles.eventMetricSecondaryText, eventGridColumns === 2 && styles.eventMetricSecondaryTextCompact]}>
                            {crewCount} looking for crew
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={[styles.eventActionRow, eventGridColumns === 2 && styles.eventActionRowCompact]}>
                    <RsvpButton
                      label={currentRsvp === "going" ? "Leave Event" : "I'm Going"}
                      active={currentRsvp === "going"}
                      onPress={(pressEvent?: any) => {
                        pressEvent?.stopPropagation?.();
                        if (currentRsvp === "going") {
                          void confirmThenUnattend(event.id);
                          return;
                        }
                        void handleRsvp(event.id, "going");
                      }}
                      disabled={saving}
                      style={[styles.eventActionButton, eventGridColumns === 2 && styles.eventActionButtonCompact]}
                    />
                  </View>
                  {saving ? <ActivityIndicator size="small" color={theme.colors.accent} /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>

      {isLoadingMore ? (
        <View style={styles.browseControls}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.browseHelper}>Loading more events…</Text>
        </View>
      ) : null}

      {!isLoading && rankedFilteredEvents.length === 0 ? (
            <Text style={styles.body}>No upcoming events match this genre and location mix yet.</Text>
      ) : null}
      </ScrollView>

      <Modal animationType="fade" transparent visible={showLocationFilterModal} onRequestClose={() => setShowLocationFilterModal(false)}>
        <View style={styles.addEventModalRoot}>
          <Pressable style={styles.addEventBackdrop} onPress={() => setShowLocationFilterModal(false)} />
          <KeyboardAvoidingView
            style={styles.locationKeyboardWrap}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Math.max(insets.bottom, 12)}
          >
            <View style={[styles.locationSheet, { paddingBottom: Math.max(insets.bottom + 14, 20) }]}>
              <View style={styles.addEventSheetHeader}>
                <View>
                  <Text style={styles.addEventSheetTitle}>Location Filter</Text>
                  <Text style={styles.locationSheetSubtitle}>Find events near you</Text>
                </View>
                <Pressable
                  style={styles.addEventSheetClose}
                  onPress={() => {
                    setShowLocationFilterModal(false);
                  }}
                >
                  <Text style={styles.addEventSheetCloseText}>Done</Text>
                </Pressable>
              </View>
              <View style={styles.locationSheetBody}>
                <View style={styles.locationSearchGroup}>
                  <View style={styles.citySelectorField}>
                    <View style={styles.citySelectorCopy}>
                      <Text style={styles.citySelectorEyebrow}>📍 Current location</Text>
                      <Text style={styles.citySelectorValue}>{viewerLocation ? viewerLocationLabel : "Los Angeles"}</Text>
                      {!viewerLocation ? (
                        <Text style={styles.citySelectorSupportingText}>Showing Los Angeles events by default</Text>
                      ) : null}
                    </View>
                  </View>
                  {!viewerLocation ? (
                    <View style={styles.locationActionButtons}>
                      <Pressable
                        style={[styles.locationActionButton, styles.locationActionButtonPrimary]}
                        onPress={() => void handleUseCurrentLocation()}
                        disabled={isLocating}
                      >
                        <Text style={[styles.locationActionButtonText, styles.locationActionButtonPrimaryText]}>
                          {isLocating ? "Detecting location..." : "Use my location"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.locationActionButton}
                        onPress={() => {
                          const rootNav: any = navigation.getParent();
                          rootNav?.navigate?.("Profile");
                          setShowLocationFilterModal(false);
                        }}
                      >
                        <Text style={styles.locationActionButtonText}>Set location in profile</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <View style={styles.radiusPickerSection}>
                  <Text style={styles.locationSectionLabel}>Distance</Text>
                  {!viewerLocation ? (
                    <Text style={styles.distanceHelperText}>Set your location to filter by distance</Text>
                  ) : (
                    <SheetStep key={`distance-${viewerLocationLabel}`}>
                      <View style={styles.distanceHeaderRow}>
                        <Text style={styles.distanceValueText}>{selectedRadiusMiles ?? 25} mi</Text>
                      </View>
                      <View style={styles.distanceSliderWrap}>
                        <Slider
                          minimumValue={0}
                          maximumValue={RADIUS_OPTIONS.length - 2}
                          step={1}
                          minimumTrackTintColor={theme.colors.accent}
                          maximumTrackTintColor="rgba(255,255,255,0.12)"
                          thumbTintColor={theme.colors.accent}
                          value={Math.min(radiusSliderValue, RADIUS_OPTIONS.length - 2)}
                          onValueChange={(value) => {
                            const option = RADIUS_OPTIONS[Math.round(value)];
                            if (option) {
                              setSelectedRadiusMiles(option.value);
                            }
                          }}
                        />
                        <View style={styles.distanceSliderLabels}>
                          {RADIUS_OPTIONS.slice(0, -1).map((option) => (
                            <Text key={option.label} style={styles.distanceSliderLabel}>
                              {option.label}
                            </Text>
                          ))}
                        </View>
                      </View>
                    </SheetStep>
                  )}
                </View>
                <View style={styles.locationFooterRow}>
                  <Pressable
                    style={styles.locationDoneButton}
                    onPress={() => {
                      setShowLocationFilterModal(false);
                    }}
                  >
                    <Text style={styles.locationDoneButtonText}>
                      {`${rankedFilteredEvents.length} ${rankedFilteredEvents.length === 1 ? "event" : "events"}`}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={isSortDropdownOpen} onRequestClose={() => setIsSortDropdownOpen(false)}>
        <View style={styles.addEventModalRoot}>
          <Pressable style={styles.addEventBackdrop} onPress={() => setIsSortDropdownOpen(false)} />
          <View style={[styles.sortBottomSheet, { paddingBottom: Math.max(insets.bottom + 14, 20) }]}>
            <View style={styles.addEventSheetHeader}>
              <Text style={styles.addEventSheetTitle}>Sort Events</Text>
            </View>
            <View style={styles.sortBottomSheetList}>
              {DISCOVER_SORT_GROUPS.map((group) => (
                <View key={group.title} style={styles.sortBottomSheetGroup}>
                  <Text style={styles.sortBottomSheetGroupTitle}>{group.title}</Text>
                  {group.options.map((option) => {
                    const active = option.key === activeSortTab;
                    const flashing = option.key === sortSelectionFeedbackKey;
                    return (
                      <Pressable
                        key={option.key}
                        style={[styles.sortBottomSheetItem, (active || flashing) && styles.sortBottomSheetItemActive]}
                        onPress={() => handleSelectSortOption(option.key)}
                      >
                        <Text style={[styles.sortBottomSheetItemText, active && styles.sortBottomSheetItemTextActive]}>
                          {active ? `✓ ${option.label}` : option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={showAddEventModal} onRequestClose={dismissAddEventModal}>
        <View style={styles.addEventModalRoot}>
          <Pressable style={styles.addEventBackdrop} onPress={dismissAddEventModal} />
          <View style={[styles.addEventSheet, { paddingBottom: Math.max(insets.bottom + 14, 20) }]}>
            <View style={styles.addEventSheetHeader}>
              <Text style={styles.addEventSheetTitle}>Add Event</Text>
              <View style={styles.addEventSheetHeaderActions}>
                {addEventStep !== "choice" ? (
                  <Pressable
                    style={styles.addEventSheetBack}
                    onPress={() => {
                      if (addEventStep === "organizer") {
                        setAddEventStep("choice");
                        setAddEventFlowType(null);
                        return;
                      }
                      if (addEventStep === "form") {
                        setAddEventStep(addEventFlowType === "promoter" ? "organizer" : "choice");
                        return;
                      }
                      if (addEventStep === "success") {
                        setAddEventStep("choice");
                        setAddEventFlowType(null);
                      }
                    }}
                  >
                    <Text style={styles.addEventSheetBackText}>Back</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.addEventSheetClose} onPress={dismissAddEventModal}>
                  <Text style={styles.addEventSheetCloseText}>Close</Text>
                </Pressable>
              </View>
            </View>

            {addEventStep === "choice" ? (
              <SheetStep>
              <View style={styles.addEventChoiceList}>
                <Pressable style={styles.addEventChoiceCard} onPress={() => selectAddEventFlow("community")}>
                  <Text style={styles.addEventChoiceTitle}>Submit a Community Event</Text>
                  <Text style={styles.addEventChoiceBody}>Community listings are reviewed before appearing publicly.</Text>
                </Pressable>
                <Pressable style={styles.addEventChoiceCard} onPress={() => selectAddEventFlow("promoter")}>
                  <Text style={styles.addEventChoiceTitle}>I&apos;m a Promoter / Organizer</Text>
                  <Text style={styles.addEventChoiceBody}>
                    Promoter listings are tied to an organizer profile and can be labeled verified or unverified.
                  </Text>
                </Pressable>
              </View>
              </SheetStep>
            ) : null}

            {addEventStep === "organizer" ? (
              <SheetStep>
              <ScrollView
                style={styles.addEventSheetScroll}
                contentContainerStyle={styles.addEventSheetContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <Text style={styles.addEventSectionTitle}>Organizer setup</Text>
                <Text style={styles.addEventHelperText}>Create an organizer profile to publish events under your brand.</Text>
                <FormField label="Organizer / Brand Name" value={organizerBrandName} onChangeText={setOrganizerBrandName} />
                <FormField label="Contact Email" value={organizerEmail} onChangeText={setOrganizerEmail} keyboardType="email-address" />
                <FormField
                  label="Instagram handle / website"
                  value={organizerSocial}
                  onChangeText={setOrganizerSocial}
                  placeholder="@yourbrand or https://"
                />
                <CheckboxRow
                  label="Request promoter verification"
                  checked={requestVerification}
                  onPress={() => setRequestVerification((prev) => !prev)}
                />
                <Pressable style={styles.primaryAction} onPress={continueToPromoterForm}>
                  <Text style={styles.primaryActionText}>Continue</Text>
                </Pressable>
              </ScrollView>
              </SheetStep>
            ) : null}

            {addEventStep === "form" ? (
              <SheetStep>
              <ScrollView
                style={styles.addEventSheetScroll}
                contentContainerStyle={styles.addEventSheetContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <Text style={styles.addEventSectionTitle}>{addEventFlowType === "promoter" ? "Create event form" : "Event essentials"}</Text>
                <Text style={styles.addEventHelperText}>Tell the community about an upcoming show or party.</Text>
                {addEventFlowType === "promoter" ? (
                  <View style={styles.badgeRow}>
                    <Text style={styles.badgeRowText}>Promoter badge defaults to Unverified Promoter until verified.</Text>
                  </View>
                ) : (
                  <View style={styles.badgeRow}>
                    <Text style={styles.badgeRowText}>Community Listing stays hidden until approved.</Text>
                  </View>
                )}
                {addEventFlowType === "promoter" ? (
                  <FormField label="Organizer Name" value={organizerBrandName} onChangeText={setOrganizerBrandName} />
                ) : null}
                <FormField label="Event Name" value={eventName} onChangeText={setEventName} />
                <FormField
                  label="Date & Start Time"
                  value={eventDateTime}
                  onChangeText={setEventDateTime}
                  placeholder="Mar 22, 2026 9:00 PM"
                />
                <FormField label="City" value={eventCity} onChangeText={setEventCity} />
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Venue</Text>
                  <View style={styles.venueModeRow}>
                    <Pressable style={[styles.venueModePill, !useManualVenue && styles.venueModePillActive]} onPress={() => setUseManualVenue(false)}>
                      <Text style={[styles.venueModeText, !useManualVenue && styles.venueModeTextActive]}>Search/select</Text>
                    </Pressable>
                    <Pressable style={[styles.venueModePill, useManualVenue && styles.venueModePillActive]} onPress={() => setUseManualVenue(true)}>
                      <Text style={[styles.venueModeText, useManualVenue && styles.venueModeTextActive]}>Add venue manually</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    value={eventVenue}
                    onChangeText={setEventVenue}
                    placeholder={useManualVenue ? "Enter venue name" : "Search venue or club name"}
                    placeholderTextColor={theme.colors.textSecondary}
                    style={styles.fieldInput}
                  />
                </View>
                <View style={styles.fieldBlock}>
                  <View style={styles.genreTagLabelRow}>
                    <Text style={styles.fieldLabel}>Genre tags</Text>
                    <Text style={styles.genreTagCount}>{selectedGenreTags.length} selected</Text>
                  </View>
                  <View style={styles.genreTagsWrap}>
                    {EVENT_GENRE_OPTIONS.map((tag) => {
                      const selected = selectedGenreTags.includes(tag);
                      return (
                        <Pressable key={tag} style={[styles.genreTagPill, selected && styles.genreTagPillActive]} onPress={() => toggleGenreTag(tag)}>
                          <Text style={[styles.genreTagPillText, selected && styles.genreTagPillTextActive]}>{selected ? `✓ ${tag}` : tag}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Pressable style={styles.optionalToggle} onPress={() => setShowOptionalDetails((prev) => !prev)}>
                  <Text style={styles.optionalToggleText}>{showOptionalDetails ? "Hide optional details" : "Add optional details"}</Text>
                </Pressable>
                {showOptionalDetails ? (
                  <View style={styles.optionalGroup}>
                    <FormField
                      label="Flyer / image upload (optional)"
                      value={eventFlyer}
                      onChangeText={setEventFlyer}
                      placeholder="Image URL or filename"
                    />
                    <FormField
                      label="Link (optional)"
                      value={eventLink}
                      onChangeText={setEventLink}
                      placeholder="Instagram, ticket link, or event page"
                    />
                  </View>
                ) : null}
                <CheckboxRow
                  label="I confirm this is a real event and details are accurate"
                  checked={eventConfirmReal}
                  onPress={() => setEventConfirmReal((prev) => !prev)}
                />
                <Pressable style={styles.primaryAction} onPress={submitAddEvent}>
                  <Text style={styles.primaryActionText}>Submit for Review</Text>
                </Pressable>
              </ScrollView>
              </SheetStep>
            ) : null}

            {addEventStep === "success" ? (
              <SheetStep>
              <View style={styles.addEventSuccessWrap}>
                <Text style={styles.addEventSuccessTitle}>Submitted - pending approval.</Text>
                <Text style={styles.addEventSuccessBody}>
                  {addEventFlowType === "promoter"
                    ? "Your listing shows as Unverified Promoter until your organizer profile is verified."
                    : "Your listing is marked Community Listing and remains hidden until approved."}
                </Text>
                <Pressable
                  style={styles.primaryAction}
                  onPress={() => {
                    resetAddEventDraft();
                    setShowAddEventModal(false);
                  }}
                >
                  <Text style={styles.primaryActionText}>Done</Text>
                </Pressable>
              </View>
              </SheetStep>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FormField(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType={props.keyboardType}
        autoCapitalize={props.keyboardType === "email-address" ? "none" : "sentences"}
        style={styles.fieldInput}
      />
    </View>
  );
}

function SheetStep(props: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(22)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [opacity, translateX]);

  return <Animated.View style={{ opacity, transform: [{ translateX }] }}>{props.children}</Animated.View>;
}

function CheckboxRow(props: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={props.onPress}>
      <View style={[styles.checkboxSquare, props.checked && styles.checkboxSquareChecked]}>
        {props.checked ? <Text style={styles.checkboxTick}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{props.label}</Text>
    </Pressable>
  );
}

function RsvpButton(props: {
  label: string;
  active: boolean;
  onPress: (event?: any) => void;
  disabled?: boolean;
  compact?: boolean;
  style?: any;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.rsvpButton,
        props.style,
        props.compact && styles.rsvpButtonCompact,
        props.active && styles.rsvpButtonActive,
        props.disabled && styles.rsvpButtonDisabled
      ]}
    >
      <Text style={[styles.rsvpButtonText, props.compact && styles.rsvpButtonTextCompact, props.active && styles.rsvpButtonTextActive]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function FlyerSurface(props: {
  uri?: string | null;
  imageStyle: any;
  fallback: React.ReactNode;
  children?: React.ReactNode;
}) {
  const showImage = Boolean(props.uri);

  return (
    <>
      {showImage ? (
        <RemoteImage uri={props.uri} style={props.imageStyle} />
      ) : (
        props.fallback
      )}
      {props.children}
    </>
  );
}

function scoreEventForDiscovery(
  event: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  searchCenter?: { lat: number; lng: number } | null
) {
  const startsAt = new Date(event.startsAt);
  const now = Date.now();
  const eventTs = Number.isNaN(startsAt.getTime()) ? now + 1000 * 60 * 60 * 24 * 365 : startsAt.getTime();
  const daysAway = Math.max(0, (eventTs - now) / (1000 * 60 * 60 * 24));
  const weekendWindow = getWeekendWindow(new Date());
  const isWeekendRelevant = startsAt >= weekendWindow.start && startsAt <= weekendWindow.end;
  const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
  const crew = metrics.lookingForCrewCount;
  const going = metrics.goingCount;
  const edmScore = computeEdmScore(event);
  const listingLabel = getEventListingLabel(event);
  const verifiedBoost = listingLabel === "Verified promoter" ? 8 : 0;
  const curatedBoost = isEventCurrentlyFeatured(event) ? 90 + (event.promotionRank ?? 0) * 3 : 0;
  const proximityBonus = Math.max(0, Math.round(30 - daysAway * 2));
  const distance = searchCenter ? getEventDistanceMiles(event, searchCenter) : null;
  const locationBoost = distance === null ? 0 : Math.max(0, Math.round(36 - distance / 3));

  return (
    (isWeekendRelevant ? 60 : 0) +
    crew * 2 +
    Math.round(going * 0.06) +
    edmScore * 5 +
    verifiedBoost +
    curatedBoost +
    proximityBonus +
    locationBoost
  );
}

function compareEventsForDiscoveryTab(
  a: EventRecord,
  b: EventRecord,
  sortTab: DiscoverSortTab,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  referenceLocation?: { lat: number; lng: number } | null
) {
  switch (sortTab) {
    case "this_weekend":
      return compareEventsThisWeekend(a, b, audienceMetrics, referenceLocation);
    case "nearest":
      return compareEventsNearest(a, b, audienceMetrics, referenceLocation);
    case "most_active":
      return compareEventsMostActive(a, b, audienceMetrics, referenceLocation);
    case "soonest":
      return compareEventsSoonest(a, b, audienceMetrics, referenceLocation);
    case "top":
    default:
      return compareEventsTop(a, b, audienceMetrics, referenceLocation);
  }
}

function compareEventsTop(
  a: EventRecord,
  b: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  referenceLocation?: { lat: number; lng: number } | null
) {
  const scoreDiff =
    scoreEventForDiscovery(b, audienceMetrics, referenceLocation) -
    scoreEventForDiscovery(a, audienceMetrics, referenceLocation);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return compareEventStartsAt(a, b);
}

function compareEventsThisWeekend(
  a: EventRecord,
  b: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  referenceLocation?: { lat: number; lng: number } | null
) {
  const weekendPriorityDiff = getWeekendPriority(b) - getWeekendPriority(a);
  if (weekendPriorityDiff !== 0) {
    return weekendPriorityDiff;
  }

  const weekendScoreDiff =
    scoreWeekendSortEvent(b, audienceMetrics, referenceLocation) -
    scoreWeekendSortEvent(a, audienceMetrics, referenceLocation);
  if (weekendScoreDiff !== 0) {
    return weekendScoreDiff;
  }

  return compareEventStartsAt(a, b);
}

function compareEventsNearest(
  a: EventRecord,
  b: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  referenceLocation?: { lat: number; lng: number } | null
) {
  const distanceCompare = compareEventDistance(a, b, referenceLocation);
  if (distanceCompare !== 0) {
    return distanceCompare;
  }

  const activityDiff = scoreEventActivity(b, audienceMetrics) - scoreEventActivity(a, audienceMetrics);
  if (activityDiff !== 0) {
    return activityDiff;
  }

  return compareEventStartsAt(a, b);
}

function compareEventsMostActive(
  a: EventRecord,
  b: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  referenceLocation?: { lat: number; lng: number } | null
) {
  const activityDiff = scoreEventActivity(b, audienceMetrics) - scoreEventActivity(a, audienceMetrics);
  if (activityDiff !== 0) {
    return activityDiff;
  }

  const scoreDiff =
    scoreEventForDiscovery(b, audienceMetrics, referenceLocation) -
    scoreEventForDiscovery(a, audienceMetrics, referenceLocation);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return compareEventStartsAt(a, b);
}

function compareEventsSoonest(
  a: EventRecord,
  b: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  referenceLocation?: { lat: number; lng: number } | null
) {
  const timeCompare = compareEventStartsAt(a, b);
  if (timeCompare !== 0) {
    return timeCompare;
  }

  return compareEventsTop(a, b, audienceMetrics, referenceLocation);
}

function compareEventsForDiscovery(
  a: EventRecord,
  b: EventRecord,
  referenceLocation?: { lat: number; lng: number } | null
) {
  const distanceCompare = compareEventDistance(a, b, referenceLocation);
  if (distanceCompare !== 0) {
    return distanceCompare;
  }

  return compareEventStartsAt(a, b);
}

function scoreEventActivity(
  event: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>
) {
  const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
  return metrics.goingCount + metrics.lookingForCrewCount * 5;
}

function scoreWeekendSortEvent(
  event: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  referenceLocation?: { lat: number; lng: number } | null
) {
  const startsAt = new Date(event.startsAt);
  const eventTs = Number.isNaN(startsAt.getTime()) ? Number.MAX_SAFE_INTEGER : startsAt.getTime();
  const now = Date.now();
  const hoursAway = Math.max(0, (eventTs - now) / (1000 * 60 * 60));
  const distance = referenceLocation ? getEventDistanceMiles(event, referenceLocation) : null;
  const distanceBoost = distance === null ? 0 : Math.max(0, Math.round(18 - distance / 5));
  return scoreEventActivity(event, audienceMetrics) * 10 + Math.max(0, Math.round(72 - hoursAway)) + distanceBoost;
}

function getWeekendPriority(event: EventRecord) {
  const startsAt = new Date(event.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return 0;
  }

  const weekendWindow = getWeekendWindow(new Date());
  return startsAt >= weekendWindow.start && startsAt <= weekendWindow.end ? 1 : 0;
}

function compareFeaturedEvents(a: EventRecord, b: EventRecord, viewerLocation?: { lat: number; lng: number } | null) {
  const distanceCompare = compareEventDistance(a, b, viewerLocation);
  if (distanceCompare !== 0) {
    return distanceCompare;
  }

  const promotionDiff = (b.promotionRank ?? 0) - (a.promotionRank ?? 0);
  if (promotionDiff !== 0) {
    return promotionDiff;
  }

  return compareEventStartsAt(a, b);
}

function isDiscoverableUpcomingEvent(event: Pick<EventRecord, "startsAt" | "endsAt">) {
  const reference = event.endsAt ?? event.startsAt;
  const timestamp = new Date(reference).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return timestamp >= Date.now();
}

const DISCOVERY_OFF_TARGET_KEYWORDS = [
  "rock",
  "metal",
  "punk",
  "pop punk",
  "hardcore",
  "alternative",
  "indie",
  "emo",
  "grunge",
  "ska",
  "americana",
  "singer-songwriter",
  "country",
  "folk",
  "mariachi",
  "opera",
  "orchestra",
  "symphony",
  "ballet",
  "broadway",
  "musical",
  "tribute",
  "hip hop",
  "hip-hop",
  "rap"
];

function isSceneRelevantDiscoveryEvent(event: Pick<EventRecord, "title" | "venueName" | "genreTags">) {
  const haystack = `${event.title} ${event.venueName ?? ""} ${(event.genreTags ?? []).join(" ")}`.toLowerCase();
  return !DISCOVERY_OFF_TARGET_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function normalizeGenreTag(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function computeEdmScore(event: EventRecord) {
  const text = `${event.title} ${(event.genreTags ?? []).join(" ")}`.toLowerCase();
  const tokens = ["edm", "rave", "electronic", "house", "techno", "dubstep", "trance", "dnb", "hardstyle", "dance"];
  return tokens.reduce((score, token) => (text.includes(token) ? score + 1 : score), 0);
}

function getEventListingLabel(event: EventRecord) {
  if (isEventCurrentlyFeatured(event)) return "R4V3 Pick";
  if (event.sourcePrimary === "ticketmaster" || event.sourcePrimary === "posh" || event.sourcePrimary === "dice") {
    return "Official listing";
  }
  if ((event.promotionRank ?? 0) > 0 || event.curationNote) return "Curated listing";
  return hashString(`${event.id}-verified`) % 10 > 6 ? "Verified promoter" : "Community listing";
}

function getClosestWeekendEvents(
  events: EventRecord[],
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>,
  viewerLocation?: { lat: number; lng: number } | null
) {
  const now = new Date();
  const { start, end } = getWeekendWindow(now);
  const scoredWeekendEvents = events
    .filter((event) => {
      const date = new Date(event.startsAt);
      if (Number.isNaN(date.getTime())) return false;
      return date >= start && date <= end;
    })
    .map((event) => {
      const eventTime = new Date(event.startsAt).getTime();
      const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
      const crew = metrics.lookingForCrewCount;
      const going = metrics.goingCount;
      const daysAway = Math.max(0, (eventTime - now.getTime()) / (1000 * 60 * 60 * 24));
      const timeProximityBonus = Math.max(0, Math.round(40 - daysAway * 4));
      const curatedBoost = isEventCurrentlyFeatured(event) ? 120 + (event.promotionRank ?? 0) * 4 : 0;
      const activityScore = crew * 2 + Math.round(going * 0.18) + timeProximityBonus + curatedBoost;
      return { event, crew, eventTime, activityScore, weekendDay: new Date(event.startsAt).getDay() };
    })
    .sort((a, b) => {
      const distanceCompare = compareEventDistance(a.event, b.event, viewerLocation);
      if (distanceCompare !== 0) return distanceCompare;
      // Primary: highest "looking for crew" first.
      if (b.crew !== a.crew) return b.crew - a.crew;
      // Secondary: soonest date.
      if (a.eventTime !== b.eventTime) return a.eventTime - b.eventTime;
      // Tertiary: blended activity score.
      return b.activityScore - a.activityScore;
    });

  const dayOrder = [5, 6, 0];
  const selectedWeekendEvents: EventRecord[] = [];
  const selectedIds = new Set<string>();

  for (const day of dayOrder) {
    const topForDay = scoredWeekendEvents.find((row) => row.weekendDay === day && !selectedIds.has(row.event.id));
    if (!topForDay) continue;
    selectedWeekendEvents.push(topForDay.event);
    selectedIds.add(topForDay.event.id);
  }

  for (const row of scoredWeekendEvents) {
    if (selectedWeekendEvents.length >= 5) break;
    if (selectedIds.has(row.event.id)) continue;
    selectedWeekendEvents.push(row.event);
    selectedIds.add(row.event.id);
  }

  if (selectedWeekendEvents.length >= 3) {
    return selectedWeekendEvents;
  }

  return [...events]
    .map((event) => {
      const eventTime = new Date(event.startsAt).getTime();
      const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
      const crew = metrics.lookingForCrewCount;
      const going = metrics.goingCount;
      const daysAway = Math.max(0, (eventTime - now.getTime()) / (1000 * 60 * 60 * 24));
      const timeProximityBonus = Math.max(0, Math.round(40 - daysAway * 4));
      const curatedBoost = isEventCurrentlyFeatured(event) ? 120 + (event.promotionRank ?? 0) * 4 : 0;
      const activityScore = crew * 2 + Math.round(going * 0.18) + timeProximityBonus + curatedBoost;
      return { event, crew, eventTime, activityScore };
    })
    .sort((a, b) => {
      const distanceCompare = compareEventDistance(a.event, b.event, viewerLocation);
      if (distanceCompare !== 0) return distanceCompare;
      if (b.crew !== a.crew) return b.crew - a.crew;
      if (a.eventTime !== b.eventTime) return a.eventTime - b.eventTime;
      return b.activityScore - a.activityScore;
    })
    .slice(0, 5)
    .map((row) => row.event);
}

function getWeekendWindow(now: Date) {
  const day = now.getDay(); // Sun=0 ... Sat=6
  const daysUntilFriday = day >= 5 || day === 0 ? 5 - day : (5 - day + 7) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() + daysUntilFriday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 2); // Fri->Sun
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  "anaheim": { lat: 33.8366, lng: -117.9143 },
  "orange county": { lat: 33.7175, lng: -117.8311 },
  "costa mesa": { lat: 33.6411, lng: -117.9187 },
  "hollywood": { lat: 34.0928, lng: -118.3287 },
  "inland empire": { lat: 34.0170, lng: -117.3664 },
  "long beach": { lat: 33.7701, lng: -118.1937 },
  "los angeles": { lat: 34.0522, lng: -118.2437 },
  "ontario": { lat: 34.0633, lng: -117.6509 },
  "pomona": { lat: 34.0551, lng: -117.749 },
  "riverside": { lat: 33.9806, lng: -117.3755 },
  "san bernardino": { lat: 34.1083, lng: -117.2898 },
  "san diego": { lat: 32.7157, lng: -117.1611 },
  "santa ana": { lat: 33.7455, lng: -117.8677 },
  "santa barbara": { lat: 34.4208, lng: -119.6982 },
  "temecula": { lat: 33.4936, lng: -117.1484 },
  "ventura": { lat: 34.2746, lng: -119.229 },
  "west hollywood": { lat: 34.0900, lng: -118.3617 }
};

const CITY_QUERY_ALIASES: Record<string, string> = {
  "la": "los angeles",
  "l.a.": "los angeles",
  "dtla": "los angeles",
  "los angeles county": "los angeles",
  "oc": "orange county",
  "orange county": "orange county",
  "orange": "orange county",
  "orange county area": "orange county",
  "ie": "inland empire",
  "inland empire": "inland empire",
  "riverisde": "riverside",
  "riverside county area": "riverside",
  "san bernardino county": "san bernardino",
  "riverside county": "riverside",
  "san diego county": "san diego",
  "sb": "san bernardino",
  "sd": "san diego",
  "weho": "west hollywood"
};

function getCityCenter(city: string) {
  const normalized = normalizeCityKey(city);
  const directKey =
    CITY_QUERY_ALIASES[normalized] ??
    (normalized.includes("los angeles") ? "los angeles" : null) ??
    (normalized.includes("san diego") ? "san diego" : null) ??
    (normalized.includes("riverside") || normalized.includes("riverisde") ? "riverside" : null);
  const direct = CITY_CENTERS[normalized] ?? RUNTIME_CITY_CENTERS[normalized] ?? CITY_CENTERS[directKey ?? ""];
  if (direct) {
    return direct;
  }

  for (const [alias, target] of Object.entries(CITY_QUERY_ALIASES)) {
    if (normalized.includes(alias)) {
      return CITY_CENTERS[target] ?? null;
    }
  }

  for (const [knownCity, center] of Object.entries(CITY_CENTERS)) {
    if (normalized.includes(knownCity) || knownCity.includes(normalized)) {
      return center;
    }
  }

  for (const [knownCity, center] of Object.entries(RUNTIME_CITY_CENTERS)) {
    if (normalized.includes(knownCity) || knownCity.includes(normalized)) {
      return center;
    }
  }

  return null;
}

function normalizeCityKey(city: string | null | undefined) {
  return (city ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function getEventDistanceMiles(event: EventRecord, searchCenter: { lat: number; lng: number }) {
  const eventCity = event.city?.trim();
  if (!eventCity) {
    return null;
  }
  const eventCenter = getCityCenter(eventCity);
  if (!eventCenter) {
    return null;
  }
  return haversineMiles(searchCenter, eventCenter);
}

function compareEventDistance(
  a: EventRecord,
  b: EventRecord,
  viewerLocation?: { lat: number; lng: number } | null
) {
  if (!viewerLocation) {
    return 0;
  }

  const distanceA = getEventDistanceMiles(a, viewerLocation);
  const distanceB = getEventDistanceMiles(b, viewerLocation);

  if (distanceA === null && distanceB === null) return 0;
  if (distanceA === null) return 1;
  if (distanceB === null) return -1;
  if (distanceA !== distanceB) return distanceA - distanceB;
  return 0;
}

function compareEventStartsAt(a: EventRecord, b: EventRecord) {
  const timeA = new Date(a.startsAt).getTime();
  const timeB = new Date(b.startsAt).getTime();
  const safeA = Number.isNaN(timeA) ? Number.MAX_SAFE_INTEGER : timeA;
  const safeB = Number.isNaN(timeB) ? Number.MAX_SAFE_INTEGER : timeB;
  return safeA - safeB;
}

function formatDistanceAway(distanceMiles: number) {
  if (distanceMiles < 10) {
    return `📍 ${distanceMiles.toFixed(1)} mi away`;
  }
  return `📍 ${Math.round(distanceMiles)} mi away`;
}

function formatAudienceSummary(metrics: { goingCount: number; lookingForCrewCount: number }) {
  const parts: string[] = [];
  if (metrics.goingCount > 0) {
    parts.push(`${metrics.goingCount} going`);
  }
  if (metrics.lookingForCrewCount > 0) {
    parts.push(`${metrics.lookingForCrewCount} looking for crew`);
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function isEventCurrentlyFeatured(event: EventRecord) {
  if (!event.isFeatured) {
    return false;
  }
  if (!event.featuredUntil) {
    return true;
  }
  const expiresAt = new Date(event.featuredUntil);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now();
}

function formatWeekendDay(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return "Weekend";
  }
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
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

function getWeekendBannerPalette(event: EventRecord, index: number) {
  const seed = `${event.title}-${(event.genreTags ?? []).join("-")}-${index}`.toLowerCase();
  if (seed.includes("bass") || seed.includes("dub")) {
    return {
      base: "#17142A",
      glowA: "rgba(122,91,255,0.36)",
      glowB: "rgba(214,120,255,0.26)",
      lineA: "rgba(203,149,255,0.40)",
      lineB: "rgba(108,131,255,0.36)"
    };
  }
  if (seed.includes("techno")) {
    return {
      base: "#1A1416",
      glowA: "rgba(255,131,99,0.34)",
      glowB: "rgba(205,102,64,0.22)",
      lineA: "rgba(255,176,126,0.38)",
      lineB: "rgba(185,126,255,0.30)"
    };
  }
  return {
    base: "#1B1510",
    glowA: "rgba(255,136,66,0.34)",
    glowB: "rgba(168,103,255,0.2)",
    lineA: "rgba(255,182,136,0.36)",
    lineB: "rgba(190,115,255,0.30)"
  };
}

function getEventTilePalette(event: EventRecord, index: number) {
  const seed = `${event.title}-${(event.genreTags ?? []).join("-")}-${index}`.toLowerCase();
  if (seed.includes("bass") || seed.includes("dub")) {
    return { base: "#191427", glow: "#6C49FF", beamA: "#7D6BFF", beamB: "#D877FF", line: "rgba(222,202,255,0.55)" };
  }
  if (seed.includes("techno")) {
    return { base: "#1A171D", glow: "#FF6B6B", beamA: "#FF7759", beamB: "#C24A22", line: "rgba(255,208,188,0.45)" };
  }
  if (seed.includes("house")) {
    return { base: "#20160F", glow: "#FF9A54", beamA: "#FFB07B", beamB: "#E46B44", line: "rgba(255,230,201,0.4)" };
  }
  return { base: "#151A22", glow: "#4F86FF", beamA: "#6AB6FF", beamB: "#8EE0FF", line: "rgba(196,226,255,0.45)" };
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  },
  container: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
    backgroundColor: theme.colors.canvas
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2
  },
  pageHeaderBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  pageHeaderBrand: {
    color: "#FFF8EE",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3
  },
  pageHeaderDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    marginTop: 2
  },
  addEventButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  addEventButtonText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800"
  },
  addEventModalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  addEventBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,6,10,0.55)"
  },
  addEventSheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(15,12,9,0.98)",
    paddingTop: 14,
    paddingHorizontal: 14,
    gap: 10
  },
  addEventSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  addEventSheetTitle: {
    color: "#FFF8EE",
    fontSize: 18,
    fontWeight: "800"
  },
  addEventSheetHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  addEventSheetBack: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.4)",
    backgroundColor: "rgba(211,92,51,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  addEventSheetBackText: {
    color: "#FFE0D2",
    fontSize: 12,
    fontWeight: "700"
  },
  addEventSheetClose: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  addEventSheetCloseText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700"
  },
  addEventChoiceList: {
    gap: 10,
    paddingBottom: 8
  },
  addEventChoiceCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    gap: 6
  },
  addEventChoiceTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  addEventChoiceBody: {
    color: "rgba(255,244,233,0.76)",
    ...theme.type.caption
  },
  addEventSheetScroll: {
    maxHeight: 560
  },
  addEventSheetContent: {
    gap: 10,
    paddingBottom: 4
  },
  addEventSectionTitle: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase"
  },
  addEventHelperText: {
    color: "rgba(255,245,237,0.72)",
    ...theme.type.caption
  },
  badgeRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  badgeRowText: {
    color: "rgba(255,245,237,0.82)",
    ...theme.type.caption
  },
  fieldBlock: {
    gap: 6
  },
  fieldLabel: {
    color: theme.colors.textPrimary,
    fontWeight: "700"
  },
  genreTagLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  genreTagCount: {
    color: "rgba(255,245,237,0.7)",
    ...theme.type.caption
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: theme.colors.textPrimary,
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  venueModeRow: {
    flexDirection: "row",
    gap: 8
  },
  venueModePill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 8,
    alignItems: "center"
  },
  venueModePillActive: {
    borderColor: "rgba(211,92,51,0.5)",
    backgroundColor: "rgba(211,92,51,0.18)"
  },
  venueModeText: {
    color: "rgba(255,247,240,0.72)",
    fontSize: 12,
    fontWeight: "700"
  },
  venueModeTextActive: {
    color: "#FFF8EE"
  },
  genreTagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  genreTagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  genreTagPillActive: {
    borderColor: "rgba(211,92,51,0.6)",
    backgroundColor: "rgba(211,92,51,0.22)"
  },
  genreTagPillText: {
    color: "rgba(255,245,237,0.82)",
    fontSize: 12,
    fontWeight: "700"
  },
  genreTagPillTextActive: {
    color: "#FFF8EE"
  },
  optionalToggle: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  optionalToggleText: {
    color: "rgba(255,244,233,0.84)",
    fontSize: 12,
    fontWeight: "700"
  },
  optionalGroup: {
    gap: 10
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center"
  },
  checkboxSquareChecked: {
    borderColor: "rgba(211,92,51,0.8)",
    backgroundColor: "rgba(211,92,51,0.22)"
  },
  checkboxTick: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800"
  },
  checkboxLabel: {
    flex: 1,
    color: "rgba(255,245,236,0.88)",
    ...theme.type.caption,
    fontWeight: "600"
  },
  primaryAction: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D35C33",
    backgroundColor: "#D65B2C",
    alignItems: "center",
    justifyContent: "center"
  },
  primaryActionText: {
    color: "#FFF8EE",
    fontSize: 15,
    fontWeight: "800"
  },
  addEventSuccessWrap: {
    gap: 10,
    paddingVertical: 12
  },
  addEventSuccessTitle: {
    color: "#FFF8EE",
    fontSize: 20,
    fontWeight: "800"
  },
  addEventSuccessBody: {
    color: "rgba(255,244,233,0.78)",
    ...theme.type.body
  },
  weekendSection: {
    gap: 8
  },
  weekendSubtitle: {
    color: theme.colors.textSecondary,
    ...theme.type.body
  },
  upcomingSupportText: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4,
    marginBottom: 6
  },
  weekendRail: {
    gap: 10,
    paddingRight: 16
  },
  weekendCard: {
    minHeight: 150,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 6,
    overflow: "hidden"
  },
  weekendFlyerImage: {
    ...StyleSheet.absoluteFillObject
  },
  weekendFlyerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,7,10,0.38)"
  },
  weekendGlowA: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 999,
    left: -42,
    top: -42
  },
  weekendGlowB: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 999,
    right: -48,
    bottom: -44
  },
  weekendBeam: {
    position: "absolute",
    left: -18,
    right: -18,
    top: 66,
    height: 14,
    borderRadius: 9
  },
  weekendBeamAlt: {
    top: 86
  },
  weekendDay: {
    color: "#F1C469",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "800"
  },
  weekendTitle: {
    color: theme.colors.textPrimary,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "800"
  },
  weekendMeta: {
    color: "rgba(255,255,255,0.84)",
    ...theme.type.body
  },
  weekendActionPill: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,10,16,0.42)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  weekendActionText: {
    color: "rgba(255,245,236,0.92)",
    fontSize: 12,
    fontWeight: "700"
  },
  weekendCarouselDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    alignSelf: "center",
    marginTop: 6,
    backgroundColor: "rgba(214,191,255,0.46)"
  },
  hero: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 16,
    gap: 10,
    overflow: "hidden"
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
  },
  heroCopyWrap: {
    flex: 1,
    gap: 2,
    paddingRight: 8
  },
  heroTitleCompact: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700"
  },
  heroMusicBadge: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  heroMusicBadgeText: {
    color: "#FFF8EE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6
  },
  heroVisualStrip: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#17161D",
    overflow: "hidden",
    justifyContent: "center"
  },
  heroVisualGlowA: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 999,
    left: -14,
    top: -24,
    backgroundColor: "#6C49FF",
    opacity: 0.22
  },
  heroVisualGlowB: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 999,
    right: -18,
    bottom: -36,
    backgroundColor: "#C24A22",
    opacity: 0.2
  },
  heroLaserLineA: {
    position: "absolute",
    left: -20,
    right: -20,
    height: 3,
    backgroundColor: "rgba(216,119,255,0.55)",
    transform: [{ rotate: "-7deg" }]
  },
  heroLaserLineB: {
    position: "absolute",
    left: -10,
    right: -10,
    top: 20,
    height: 2,
    backgroundColor: "rgba(125,107,255,0.5)",
    transform: [{ rotate: "8deg" }]
  },
  heroLaserLineC: {
    position: "absolute",
    left: -16,
    right: -16,
    bottom: 16,
    height: 2,
    backgroundColor: "rgba(255,176,123,0.42)",
    transform: [{ rotate: "-4deg" }]
  },
  heroFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  heroMiniCopy: {
    color: "rgba(255,249,239,0.86)",
    fontSize: 12,
    fontWeight: "600",
    flex: 1
  },
  heroMiniCopyMuted: {
    color: theme.colors.textSecondary,
    ...theme.type.caption,
    fontWeight: "700",
    flexShrink: 0
  },
  eyebrow: {
    color: theme.colors.textSecondary,
    ...theme.type.eyebrow,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleLg
  },
  body: {
    color: theme.colors.textSecondary,
    ...theme.type.body
  },
  hint: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  sectionHeaderRowCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    ...theme.type.titleMd
  },
  sectionMeta: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  genreSection: {
    gap: 8
  },
  discoveryControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  upcomingHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  sortDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  sortDropdownTriggerText: {
    color: theme.colors.textPrimary,
    ...theme.type.caption,
    fontWeight: "700"
  },
  sortDropdownTriggerGlyph: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "800"
  },
  sortBottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#14110D",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10
  },
  sortBottomSheetList: {
    gap: 10
  },
  sortBottomSheetGroup: {
    gap: 5
  },
  sortBottomSheetGroupTitle: {
    color: "rgba(255,245,237,0.44)",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.35
  },
  sortBottomSheetItem: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  sortBottomSheetItemActive: {
    backgroundColor: "rgba(211,92,51,0.14)"
  },
  sortBottomSheetItemText: {
    color: "rgba(255,245,237,0.86)",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600"
  },
  sortBottomSheetItemTextActive: {
    color: "#FFF8EE",
    fontWeight: "800"
  },
  locationTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 132,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  locationTriggerGlyphText: {
    color: "rgba(255,232,182,0.92)",
    fontSize: 14,
    fontWeight: "800"
  },
  locationTriggerValue: {
    flex: 1,
    color: "rgba(255,248,238,0.9)",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700"
  },
  locationSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#14110D",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14
  },
  locationSheetSubtitle: {
    color: "rgba(255,249,239,0.7)",
    ...theme.type.caption
  },
  locationSheetBody: {
    gap: 12
  },
  locationKeyboardWrap: {
    justifyContent: "flex-end"
  },
  locationSearchGroup: {
    gap: 8
  },
  locationSectionLabel: {
    color: "rgba(255,249,239,0.68)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  citySelectorField: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  citySelectorCopy: {
    flex: 1,
    gap: 4
  },
  citySelectorEyebrow: {
    color: "rgba(255,249,239,0.52)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  citySelectorValue: {
    color: "#FFF8EE",
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800"
  },
  citySelectorSupportingText: {
    color: "rgba(255,249,239,0.58)",
    fontSize: 12,
    lineHeight: 16
  },
  locationActionButtons: {
    flexDirection: "row",
    gap: 10
  },
  locationActionButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.015)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  locationActionButtonPrimary: {
    borderColor: "rgba(211,92,51,0.46)",
    backgroundColor: "rgba(211,92,51,0.22)"
  },
  locationActionButtonText: {
    color: "rgba(255,248,238,0.78)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center"
  },
  locationActionButtonPrimaryText: {
    color: "#FFF4EC"
  },
  radiusPickerSection: {
    gap: 6,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)"
  },
  distanceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  distanceValueText: {
    color: "#FFF8EE",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700"
  },
  distanceSliderWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10
  },
  distanceSliderWrapDisabled: {
    opacity: 0.45
  },
  distanceSliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  distanceSliderLabel: {
    color: "rgba(255,249,239,0.54)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600"
  },
  distanceHelperText: {
    color: "rgba(255,249,239,0.52)",
    fontSize: 12,
    lineHeight: 16
  },
  locationFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  locationDoneButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.4)",
    backgroundColor: "rgba(211,92,51,0.18)",
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  locationDoneButtonText: {
    color: "#FFF4EC",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800"
  },
  featuredSection: {
    gap: 10,
    marginBottom: 8
  },
  featuredRail: {
    gap: 12,
    paddingRight: 16
  },
  featuredCard: {
    width: 228,
    height: 292,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#12100D"
  },
  featuredImage: {
    ...StyleSheet.absoluteFillObject
  },
  featuredImageFallback: {
    ...StyleSheet.absoluteFillObject
  },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,6,0.28)"
  },
  featuredBody: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    gap: 6
  },
  featuredPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(17,15,12,0.62)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  featuredPillText: {
    color: "#F4C56A",
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: "800"
  },
  featuredTitle: {
    color: "#FFF8EE",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800"
  },
  featuredMeta: {
    color: "rgba(255,249,239,0.86)",
    ...theme.type.body,
    fontWeight: "700"
  },
  featuredSubmeta: {
    color: "rgba(255,249,239,0.72)",
    ...theme.type.caption,
    fontWeight: "700"
  },
  distanceMeta: {
    color: "#F4D08A",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700"
  },
  genreRail: {
    gap: 8,
    paddingRight: 8
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  errorInlineCard: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,159,159,0.28)",
    backgroundColor: "rgba(90,24,24,0.24)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  errorInlineButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  errorInlineButtonText: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800"
  },
  genreChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  genreChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft
  },
  genreChipText: {
    color: theme.colors.textPrimary,
    ...theme.type.caption,
    fontWeight: "700"
  },
  genreChipTextActive: {
    color: theme.colors.textPrimary
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6
  },
  eventCardList: {
    gap: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  browseControls: {
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 8
  },
  browseButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  browseButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: "800"
  },
  browseHelper: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  eventCardShell: {
    gap: 0
  },
  eventCardShellHalf: {
    marginBottom: 0
  },
  eventCard: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#111726"
  },
  eventCardCompact: {
    borderRadius: 20
  },
  eventPoster: {
    height: 188,
    padding: 14,
    justifyContent: "space-between",
    overflow: "hidden"
  },
  eventPosterFlyerImage: {
    ...StyleSheet.absoluteFillObject
  },
  eventPosterFlyerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,10,16,0.26)"
  },
  eventPosterBottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 118,
    backgroundColor: "rgba(4,6,10,0.54)"
  },
  eventPosterGrid: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.06,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.18)"
  },
  eventPosterGlowBottom: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    left: 90,
    bottom: -120,
    opacity: 0.12
  },
  tileGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    right: -30,
    top: -24,
    opacity: 0.28
  },
  tileBeam: {
    position: "absolute",
    width: 520,
    height: 20,
    left: -30,
    top: 78,
    opacity: 0.18,
    borderRadius: 10
  },
  tileBeamAlt: {
    top: 112,
    left: -8
  },
  tileBeamThin: {
    position: "absolute",
    width: 520,
    height: 2,
    left: -24,
    top: 98,
    opacity: 0.4,
    transform: [{ rotate: "8deg" }]
  },
  eventPosterTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  eventPosterGenrePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(6,7,10,0.50)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: "72%"
  },
  eventPosterGenrePillText: {
    color: "#FFF8EE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7
  },
  eventPosterPreviewButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(6,7,10,0.28)",
    alignItems: "center",
    justifyContent: "center"
  },
  eventPosterPreviewButtonActive: {
    borderColor: "rgba(135,219,255,0.45)",
    backgroundColor: "rgba(12,44,66,0.42)"
  },
  eventPosterPreviewButtonGlyph: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 1
  },
  eventPosterBottom: {
    gap: 4
  },
  eventPosterTitle: {
    color: "#FFFDF8",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.52)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6
  },
  eventPosterTitleCompact: {
    fontSize: 14,
    lineHeight: 17
  },
  eventListingLabel: {
    color: "rgba(255,241,219,0.9)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 1,
    textShadowColor: "rgba(0,0,0,0.42)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  eventPosterMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  eventPosterMetaIcon: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14
  },
  eventPosterMetaText: {
    color: "rgba(255,250,243,0.94)",
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
    textShadowColor: "rgba(0,0,0,0.44)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  eventPosterMetaTextCity: {
    flex: 1,
    minWidth: 0
  },
  eventPosterMetaTextDate: {
    flexShrink: 0
  },
  eventPosterMetaTextCompact: {
    fontSize: 10
  },
  eventPosterMetaDot: {
    color: "rgba(255,249,239,0.55)",
    fontSize: 13
  },
  eventCardBody: {
    backgroundColor: "#101A2A",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    padding: 12,
    gap: 10
  },
  eventCardBodyCompact: {
    padding: 10,
    gap: 8
  },
  eventMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  eventMetricPrimary: {
    flexShrink: 0
  },
  eventMetricPrimaryText: {
    color: "rgba(255,248,238,0.95)",
    fontSize: 14,
    fontWeight: "700"
  },
  eventMetricPrimaryTextCompact: {
    fontSize: 11
  },
  eventMetricDivider: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  eventMetricSecondary: {
    flex: 1
  },
  eventMetricSecondaryCompact: {
    flex: 1
  },
  eventMetricSecondaryText: {
    color: "rgba(202,170,255,0.9)",
    fontSize: 11,
    fontWeight: "600"
  },
  eventMetricSecondaryTextCompact: {
    fontSize: 9
  },
  eventActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  eventActionRowCompact: {
    gap: 6
  },
  rsvpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  rsvpButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  rsvpButtonCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  rsvpButtonActive: {
    borderColor: "rgba(211,92,51,0.34)",
    backgroundColor: "rgba(211,92,51,0.16)"
  },
  rsvpButtonDisabled: {
    opacity: 0.6
  },
  rsvpButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    ...theme.type.caption
  },
  rsvpButtonTextCompact: {
    fontSize: 11
  },
  rsvpButtonTextActive: {
    color: theme.colors.textPrimary
  },
  eventActionButton: {
    flex: 1
  },
  eventActionButtonCompact: {
    minHeight: 42
  },
  eventOpenButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center"
  },
  eventOpenButtonCompact: {
    width: 42,
    minWidth: 42,
    height: 42
  },
  eventOpenButtonText: {
    color: "#FFF8EE",
    fontSize: 24,
    fontWeight: "600",
    marginTop: -2
  }
});
