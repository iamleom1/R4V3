import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
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
import { theme } from "../../theme";
import type { EventRecord, RSVPStatus } from "../../types/domain";
import {
  hasEventCrewChat,
  listEventAudienceMetrics,
  listUpcomingEvents
} from "./eventRepository";
import type { DiscoverStackParamList } from "./DiscoverNavigator";
import { useEventRsvpState } from "./useEventRsvpState";

type Props = NativeStackScreenProps<DiscoverStackParamList, "DiscoverHome">;
type AddEventStep = "choice" | "organizer" | "form" | "success";
type AddEventFlowType = "community" | "promoter" | null;

const EVENT_GENRE_OPTIONS = ["House", "Tech House", "Techno", "Dubstep", "Trance", "Drum & Bass", "Hardstyle", "Bass"];

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
  const { session } = useAppState();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const { rsvps, setRsvp, refreshRsvps } = useEventRsvpState(session?.user?.id ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string>("All");
  const [error, setError] = useState<string | null>(null);
  const [audienceMetrics, setAudienceMetrics] = useState<Record<string, { goingCount: number; lookingForCrewCount: number }>>({});

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const event of events) {
      for (const tag of event.genreTags ?? []) {
        if (tag.trim()) {
          set.add(tag);
        }
      }
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [events]);
  const filteredEvents = useMemo(() => {
    if (selectedGenre === "All") {
      return events;
    }
    return events.filter((event) => (event.genreTags ?? []).includes(selectedGenre));
  }, [events, selectedGenre]);
  const rankedFilteredEvents = useMemo(() => {
    return [...filteredEvents].sort(
      (a, b) => scoreEventForDiscovery(b, audienceMetrics) - scoreEventForDiscovery(a, audienceMetrics)
    );
  }, [audienceMetrics, filteredEvents]);
  const weekendEvents = useMemo(() => getClosestWeekendEvents(events, audienceMetrics), [audienceMetrics, events]);
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

  const loadEventDiscovery = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const eventRows = await listUpcomingEvents();
        setEvents(eventRows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load events.");
      } finally {
        if (showSpinner) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadEventDiscovery(true);
  }, [loadEventDiscovery]);

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

  useFocusEffect(
    useCallback(() => {
      // Keep card RSVP state in sync after actions taken on detail screen.
      void refreshRsvps();
      void loadEventDiscovery(false);
    }, [loadEventDiscovery, refreshRsvps])
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

  return (
    <View style={styles.screenRoot}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: Math.max(insets.top + 8, 22) }]}
        onScrollBeginDrag={pauseWeekendAutoRotate}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
          <Text style={styles.sectionTitle}>Happening This Weekend</Text>
          <Text style={styles.sectionMeta}>{weekendEvents.length} events</Text>
        </View>
        <Text style={styles.weekendSubtitle}>Closest Thursday, Friday, and Saturday picks.</Text>
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
                <View style={[styles.weekendGlowA, { backgroundColor: palette.glowA }]} />
                <View style={[styles.weekendGlowB, { backgroundColor: palette.glowB }]} />
                <View style={[styles.weekendBeam, { backgroundColor: palette.lineA, transform: [{ rotate: "-8deg" }] }]} />
                <View style={[styles.weekendBeam, styles.weekendBeamAlt, { backgroundColor: palette.lineB, transform: [{ rotate: "7deg" }] }]} />
                <Text style={styles.weekendDay}>{formatWeekendDay(event.startsAt)}</Text>
                <Text style={styles.weekendTitle} numberOfLines={2}>{event.title}</Text>
                <Text style={styles.weekendMeta} numberOfLines={1}>{event.city || "City TBD"} • {formatEventDate(event.startsAt)}</Text>
                <View style={styles.weekendActionPill}>
                  <Text style={styles.weekendActionText}>View weekend lineup</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        {weekendEvents.length > 1 ? <View style={styles.weekendCarouselDot} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.genreSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Browse by genre</Text>
          <Text style={styles.sectionMeta}>{selectedGenre === "All" ? "All events" : selectedGenre}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRail}>
          {availableGenres.map((genre) => {
            const active = selectedGenre === genre;
            return (
              <Pressable key={genre} onPress={() => setSelectedGenre(genre)} style={[styles.genreChip, active && styles.genreChipActive]}>
                <Text style={[styles.genreChipText, active && styles.genreChipTextActive]}>{genre}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Upcoming events</Text>
        <Text style={styles.sectionMeta}>{isLoading ? "Loading" : events.length > 0 ? "Live" : "No events"}</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.body}>Loading events...</Text>
        </View>
      ) : null}

      <View style={styles.eventCardList}>
        {rankedFilteredEvents.map((event, idx) => {
          const currentRsvp = rsvps[event.id];
          const saving = isSavingId === event.id;
          const palette = getEventTilePalette(event, idx);
          const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
          const goingCount = metrics.goingCount;
          const crewCount = metrics.lookingForCrewCount;
          const listingLabel = getEventListingLabel(event);
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
                  <View style={[styles.tileGlow, { backgroundColor: palette.glow }]} />
                  <View style={[styles.eventPosterGlowBottom, { backgroundColor: palette.glow }]} />
                  <View style={[styles.tileBeam, { backgroundColor: palette.beamA, transform: [{ rotate: "-14deg" }] }]} />
                  <View style={[styles.tileBeam, styles.tileBeamAlt, { backgroundColor: palette.beamB, transform: [{ rotate: "12deg" }] }]} />
                  <View style={[styles.tileBeamThin, { backgroundColor: palette.line }]} />
                  <View style={styles.eventPosterGrid} />
                  <View style={styles.eventPosterTopRow}>
                    <View style={styles.eventPosterGenrePill}>
                      <Text style={styles.eventPosterGenrePillText}>
                        {((event.genreTags ?? [])[0] ?? "EDM").toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.eventPosterMusicIcon}>
                      <Text style={styles.eventPosterMusicIconText}>♫</Text>
                    </View>
                  </View>
                  <View style={styles.eventPosterBottomFade} />
                  <View style={styles.eventPosterBottom}>
                    <Text style={[styles.eventPosterTitle, eventGridColumns === 2 && styles.eventPosterTitleCompact]} numberOfLines={2}>
                      {event.title}
                    </Text>
                    <Text style={styles.eventListingLabel} numberOfLines={1}>
                      {listingLabel}
                    </Text>
                    <View style={styles.eventPosterMetaRow}>
                      <Text style={styles.eventPosterMetaIcon}>⌖</Text>
                      <Text style={[styles.eventPosterMetaText, eventGridColumns === 2 && styles.eventPosterMetaTextCompact]} numberOfLines={1}>
                        {event.city || "City TBD"}
                      </Text>
                      <Text style={styles.eventPosterMetaDot}>•</Text>
                      <Text style={[styles.eventPosterMetaText, eventGridColumns === 2 && styles.eventPosterMetaTextCompact]} numberOfLines={1}>
                        {formatEventDate(event.startsAt)}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.eventCardBody, eventGridColumns === 2 && styles.eventCardBodyCompact]}>
                  <View style={styles.eventMetricsRow}>
                    <View style={styles.eventMetricPrimary}>
                      <Text style={[styles.eventMetricPrimaryText, eventGridColumns === 2 && styles.eventMetricPrimaryTextCompact]}>
                        {goingCount} going
                      </Text>
                    </View>
                    <View style={styles.eventMetricDivider} />
                    <View style={[styles.eventMetricSecondary, eventGridColumns === 2 && styles.eventMetricSecondaryCompact]}>
                      <Text style={[styles.eventMetricSecondaryText, eventGridColumns === 2 && styles.eventMetricSecondaryTextCompact]}>
                        {crewCount} looking for crew
                      </Text>
                    </View>
                  </View>

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

      {!isLoading && rankedFilteredEvents.length === 0 ? (
        <Text style={styles.body}>No upcoming events found for this genre yet.</Text>
      ) : null}
      </ScrollView>

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

function scoreEventForDiscovery(
  event: EventRecord,
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>
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
  const verifiedBoost = getEventListingLabel(event) === "Verified promoter" ? 8 : 0;
  const proximityBonus = Math.max(0, Math.round(30 - daysAway * 2));

  return (
    (isWeekendRelevant ? 60 : 0) +
    crew * 2 +
    Math.round(going * 0.06) +
    edmScore * 5 +
    verifiedBoost +
    proximityBonus
  );
}

function computeEdmScore(event: EventRecord) {
  const text = `${event.title} ${(event.genreTags ?? []).join(" ")}`.toLowerCase();
  const tokens = ["edm", "rave", "electronic", "house", "techno", "dubstep", "trance", "dnb", "hardstyle", "dance"];
  return tokens.reduce((score, token) => (text.includes(token) ? score + 1 : score), 0);
}

function getEventListingLabel(event: EventRecord) {
  if (event.sourcePrimary === "ticketmaster") return "Official listing";
  // Deterministic split for seeded/community events.
  return hashString(`${event.id}-verified`) % 10 > 6 ? "Verified promoter" : "Community listing";
}

function getClosestWeekendEvents(
  events: EventRecord[],
  audienceMetrics: Record<string, { goingCount: number; lookingForCrewCount: number }>
) {
  const now = new Date();
  const { start, end } = getWeekendWindow(now);
  const weekendEvents = events
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
      const activityScore = crew * 2 + Math.round(going * 0.18) + timeProximityBonus;
      return { event, crew, eventTime, activityScore };
    })
    .sort((a, b) => {
      // Primary: highest "looking for crew" first.
      if (b.crew !== a.crew) return b.crew - a.crew;
      // Secondary: soonest date.
      if (a.eventTime !== b.eventTime) return a.eventTime - b.eventTime;
      // Tertiary: blended activity score.
      return b.activityScore - a.activityScore;
    })
    .slice(0, 5)
    .map((row) => row.event);

  if (weekendEvents.length >= 3) {
    return weekendEvents;
  }

  return [...events]
    .map((event) => {
      const eventTime = new Date(event.startsAt).getTime();
      const metrics = audienceMetrics[event.id] ?? { goingCount: 0, lookingForCrewCount: 0 };
      const crew = metrics.lookingForCrewCount;
      const going = metrics.goingCount;
      const daysAway = Math.max(0, (eventTime - now.getTime()) / (1000 * 60 * 60 * 24));
      const timeProximityBonus = Math.max(0, Math.round(40 - daysAway * 4));
      const activityScore = crew * 2 + Math.round(going * 0.18) + timeProximityBonus;
      return { event, crew, eventTime, activityScore };
    })
    .sort((a, b) => {
      if (b.crew !== a.crew) return b.crew - a.crew;
      if (a.eventTime !== b.eventTime) return a.eventTime - b.eventTime;
      return b.activityScore - a.activityScore;
    })
    .slice(0, 5)
    .map((row) => row.event);
}

function getWeekendWindow(now: Date) {
  const day = now.getDay(); // Sun=0 ... Sat=6
  const daysUntilThursday = (4 - day + 7) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() + daysUntilThursday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 3); // Thu->Sun
  end.setHours(23, 59, 59, 999);
  return { start, end };
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
  genreRail: {
    gap: 8,
    paddingRight: 8
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600"
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
  eventPosterMusicIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(6,7,10,0.50)",
    alignItems: "center",
    justifyContent: "center"
  },
  eventPosterMusicIconText: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "700"
  },
  eventPosterBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 92,
    backgroundColor: "rgba(8,9,12,0.62)"
  },
  eventPosterBottom: {
    gap: 4
  },
  eventPosterTitle: {
    color: "#FFF8EE",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800"
  },
  eventPosterTitleCompact: {
    fontSize: 14,
    lineHeight: 17
  },
  eventListingLabel: {
    color: "rgba(255,232,198,0.82)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 1
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
    color: "rgba(255,249,239,0.86)",
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1
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
