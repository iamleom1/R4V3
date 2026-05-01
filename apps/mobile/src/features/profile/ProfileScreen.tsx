import React, { useEffect, useMemo, useRef, useState } from "react";
import Slider from "@react-native-community/slider";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../app/AppProvider";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { RemoteImage } from "../../components/RemoteImage";
import { theme } from "../../theme";
import { captureCurrentDeviceLocation } from "./deviceLocationService";
import { matchPreferenceOptions, normalizeStoredInterestedGenders, profileGenderOptions } from "./genderOptions";
import { listProfilePhotos, type ProfilePhoto } from "./photoRepository";
import { isCurrentUserModerator } from "./moderationRepository";
import type { ProfileStackParamList } from "./ProfileNavigator";

const vibeOptions = ["Solo-friendly", "Small crew", "Open crew", "Sober-friendly", "Stick together", "Chill meetup", "Afters", "First-timer friendly"];
const genreOptions = ["House", "Techno", "Trance", "DnB", "Dubstep", "UKG", "Hardgroove", "Disco"];
const pronounOptions = ["she/her", "he/him", "they/them", "she/they", "he/they", "any pronouns", "prefer not to say"];
const smokingOptions = ["Never", "Occasionally", "Socially", "Regularly", "Prefer not to say"];
const drinkingOptions = ["Never", "Rarely", "Socially", "Often", "Sober", "Prefer not to say"];
const zodiacOptions = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];
const heightOptions = buildHeightOptions();
const MIN_AGE = 18;
const MAX_AGE = 50;
const crewSignalSpotlightCards = [
  {
    label: "Small crew",
    subtitle: "Tight group, low noise",
    iconVariant: "pair",
    glyph: "PAIR",
    palette: { backgroundColor: "#1D1712", borderColor: "rgba(153,124,78,0.28)", orb: "rgba(162,124,76,0.12)", beam: "rgba(224,178,116,0.10)" }
  },
  {
    label: "Open crew",
    subtitle: "Meet new people",
    iconVariant: "radar",
    glyph: "OPEN",
    palette: { backgroundColor: "#131A24", borderColor: "rgba(94,126,189,0.28)", orb: "rgba(95,139,214,0.12)", beam: "rgba(144,185,255,0.10)" }
  },
  {
    label: "Chill meetup",
    subtitle: "Low-key energy",
    iconVariant: "chill",
    glyph: "CHILL",
    palette: { backgroundColor: "#1E1413", borderColor: "rgba(201,101,71,0.26)", orb: "rgba(214,122,89,0.12)", beam: "rgba(255,170,132,0.10)" }
  }
] as const;

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { session, profileDraft, profileSaveStatus, profileSaveError, updateProfileDraft, saveProfileDraft, signOut, deleteAccount } = useAppState();
  const [photoSlots, setPhotoSlots] = useState<Array<ProfilePhoto | null>>([null, null, null, null, null, null]);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const [crewSignalsY, setCrewSignalsY] = useState(0);
  const [bioSectionY, setBioSectionY] = useState(0);
  const [crewSettingsY, setCrewSettingsY] = useState(0);
  const [showAllVibes, setShowAllVibes] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [activePicker, setActivePicker] = useState<null | "height" | "pronouns" | "gender" | "smoking" | "drinking">(null);
  const [isZodiacModalOpen, setIsZodiacModalOpen] = useState(false);
  const [isInterestedGenderModalOpen, setIsInterestedGenderModalOpen] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const isNameLocked = profileDraft.onboardingCompleted && profileDraft.displayName.trim().length > 0;
  const isAgeLocked = profileDraft.onboardingCompleted && profileDraft.birthdate.trim().length > 0;
  const hasPhoto = photoSlots.some((slot) => Boolean(slot));
  const hasShortBio = profileDraft.bio.trim().length > 0;
  const hasEnoughVibes = profileDraft.vibeTags.length >= 1;
  const hasEnoughGenres = profileDraft.musicGenres.length >= 1;
  const crewReadinessChecks = useMemo(
    () => ({
      photo: hasPhoto,
      bio: hasShortBio,
      vibes: hasEnoughVibes,
      genres: hasEnoughGenres,
      guidelines: profileDraft.guidelinesAccepted
    }),
    [hasEnoughGenres, hasEnoughVibes, hasPhoto, hasShortBio, profileDraft.guidelinesAccepted]
  );
  const crewReadinessCount = Object.values(crewReadinessChecks).filter(Boolean).length;
  const crewReadinessPct = Math.round((crewReadinessCount / 5) * 100);
  const isCrewReadinessComplete = crewReadinessCount === 5;
  const crewReadinessLockedReason =
    isCrewReadinessComplete
      ? null
      : "Crew matching is locked until you add 1 photo, a bio, 1 vibe, 1 genre, and accept guidelines.";

  const ageText = useMemo(() => formatAgeFromBirthdate(profileDraft.birthdate), [profileDraft.birthdate]);
  const selectedZodiacSigns = useMemo(() => parseCsvList(profileDraft.zodiac), [profileDraft.zodiac]);
  const identityChips = useMemo(
    () => [...profileDraft.musicGenres.slice(0, 2), ...profileDraft.vibeTags.slice(0, 1)],
    [profileDraft.musicGenres, profileDraft.vibeTags]
  );
  const coverPhotoUrl = photoSlots[0]?.url ?? "";
  const initials = useMemo(() => {
    const text = profileDraft.displayName.trim();
    if (!text) return "R4";
    return text
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [profileDraft.displayName]);
  const visibleVibeOptions = useMemo(() => {
    if (showAllVibes) return vibeOptions;
    const selected = vibeOptions.filter((tag) => profileDraft.vibeTags.includes(tag));
    const unselected = vibeOptions.filter((tag) => !profileDraft.vibeTags.includes(tag));
    return [...selected, ...unselected].slice(0, 4);
  }, [profileDraft.vibeTags, showAllVibes]);
  const visibleGenreOptions = useMemo(() => {
    if (showAllGenres) return genreOptions;
    const selected = genreOptions.filter((tag) => profileDraft.musicGenres.includes(tag));
    const unselected = genreOptions.filter((tag) => !profileDraft.musicGenres.includes(tag));
    return [...selected, ...unselected].slice(0, 4);
  }, [profileDraft.musicGenres, showAllGenres]);
  const normalizedInterestedGenders = useMemo(
    () => normalizeStoredInterestedGenders(profileDraft.interestedGenders),
    [profileDraft.interestedGenders]
  );
  useEffect(() => {
    if (!isCrewReadinessComplete && profileDraft.communityModeEnabled) {
      updateProfileDraft({ communityModeEnabled: false });
    }
  }, [isCrewReadinessComplete, profileDraft.communityModeEnabled, updateProfileDraft]);

  function toggleVibeTag(tag: string) {
    const next = profileDraft.vibeTags.includes(tag)
      ? profileDraft.vibeTags.filter((t) => t !== tag)
      : [...profileDraft.vibeTags, tag];
    updateProfileDraft({ vibeTags: next });
  }

  function toggleGenre(tag: string) {
    const next = profileDraft.musicGenres.includes(tag)
      ? profileDraft.musicGenres.filter((t) => t !== tag)
      : [...profileDraft.musicGenres, tag];
    updateProfileDraft({ musicGenres: next });
  }

  function handleToggleOpenToCrewMatching() {
    const next = !profileDraft.communityModeEnabled;
    if (next && !isCrewReadinessComplete) {
      Alert.alert(
        "Complete profile first",
        "Add 1 photo, a bio, 1 vibe, 1 genre, and accept guidelines before opening crew matching."
      );
      return;
    }
    updateProfileDraft({
      communityModeEnabled: next,
      datingModeEnabled: false
    });
  }

  useEffect(() => {
    let active = true;

    async function loadPhotos() {
      if (!session?.user?.id) {
        if (active) {
          setPhotoSlots([null, null, null, null, null, null]);
        }
        return;
      }

      const rows = await listProfilePhotos(session.user.id);
      if (!active) return;

      const next: Array<ProfilePhoto | null> = [null, null, null, null, null, null];
      for (const photo of rows) {
        if (photo.sortOrder >= 0 && photo.sortOrder < next.length) {
          next[photo.sortOrder] = photo;
        }
      }
      setPhotoSlots(next);
    }

    void loadPhotos();
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      if (!session?.user?.id) {
        setIsModerator(false);
        return undefined;
      }
      let active = true;
      void listProfilePhotos(session.user.id).then((rows) => {
        if (!active) return;
        const next: Array<ProfilePhoto | null> = [null, null, null, null, null, null];
        for (const photo of rows) {
          if (photo.sortOrder >= 0 && photo.sortOrder < next.length) next[photo.sortOrder] = photo;
        }
        setPhotoSlots(next);
      });
      void isCurrentUserModerator().then((value) => {
        if (!active) return;
        setIsModerator(value);
      });
      return () => {
        active = false;
      };
    }, [session?.user?.id])
  );

  async function handleCaptureLocation() {
    setIsCapturingLocation(true);
    const result = await captureCurrentDeviceLocation();
    setIsCapturingLocation(false);

    if (!result.ok) {
      Alert.alert("Location unavailable", result.error);
      return;
    }

    updateProfileDraft({
      locationLat: result.location.latitude,
      locationLng: result.location.longitude,
      locationAccuracyMeters: result.location.accuracyMeters,
      locationCapturedAt: result.location.capturedAt,
      city: result.location.city ?? profileDraft.city
    });
  }

  const activePickerConfig = useMemo(() => {
    if (!activePicker) return null;
    if (activePicker === "height") {
      return {
        title: "Select height",
        options: heightOptions,
        value: profileDraft.height,
        onSelect: (value: string) => updateProfileDraft({ height: value })
      };
    }
    if (activePicker === "pronouns") {
      return {
        title: "Select pronouns",
        options: pronounOptions,
        value: profileDraft.pronouns,
        onSelect: (value: string) => updateProfileDraft({ pronouns: value })
      };
    }
    if (activePicker === "gender") {
      return {
        title: "Select gender",
        options: [...profileGenderOptions],
        value: profileDraft.gender,
        onSelect: (value: string) => updateProfileDraft({ gender: value })
      };
    }
    if (activePicker === "smoking") {
      return {
        title: "Smoking",
        options: smokingOptions,
        value: profileDraft.smokingPreference,
        onSelect: (value: string) => updateProfileDraft({ smokingPreference: value })
      };
    }
    return {
      title: "Drinking",
      options: drinkingOptions,
      value: profileDraft.drinkingPreference,
      onSelect: (value: string) => updateProfileDraft({ drinkingPreference: value })
    };
  }, [activePicker, profileDraft.drinkingPreference, profileDraft.gender, profileDraft.height, profileDraft.pronouns, profileDraft.smokingPreference, updateProfileDraft]);

  function toggleZodiacSign(sign: string) {
    const next = selectedZodiacSigns.includes(sign)
      ? selectedZodiacSigns.filter((value) => value !== sign)
      : [...selectedZodiacSigns, sign];
    updateProfileDraft({ zodiac: next.join(", ") });
  }

  async function handleDeleteAccount() {
    if (deleteConfirmationText.trim().toUpperCase() !== "DELETE") {
      Alert.alert("Confirmation required", "Type DELETE to confirm permanent account deletion.");
      return;
    }

    setIsDeletingAccount(true);
    const result = await deleteAccount();
    setIsDeletingAccount(false);

    if (!result.ok) {
      Alert.alert("Delete failed", result.error ?? "Failed to delete account.");
      return;
    }

    setDeleteConfirmationText("");
    setIsDeleteModalOpen(false);
    Alert.alert("Account deleted", "Your account and related data were permanently removed.");
  }

  function scrollTo(y: number) {
    scrollRef.current?.scrollTo({ y: Math.max(y - 18, 0), animated: true });
  }

  function handleReadinessPress(target: "photo" | "bio" | "vibes" | "genres" | "guidelines") {
    if (target === "photo") {
      navigation.navigate("ProfilePhotos");
      return;
    }
    if (target === "bio") {
      scrollTo(bioSectionY);
      return;
    }
    if (target === "vibes" || target === "genres") {
      scrollTo(crewSignalsY);
      if (target === "vibes") setShowAllVibes(true);
      if (target === "genres") setShowAllGenres(true);
      return;
    }
    scrollTo(crewSettingsY);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
      <>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.container, { paddingTop: Math.max(insets.top + 8, 18), paddingBottom: Math.max(insets.bottom + 24, 28) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroNoiseBand} />
            <View style={styles.heroGridLineA} />
            <View style={styles.heroGridLineB} />

        <View style={styles.heroPassTop}>
          <View style={styles.heroPassStamp}>
            <View style={styles.heroAvatarFrame}>
              {coverPhotoUrl ? <RemoteImage uri={coverPhotoUrl} style={styles.heroCoverImage} transition={0} /> : null}
              <View style={styles.heroCoverOverlay} />
              {!coverPhotoUrl ? <Text style={styles.heroPassStampValue}>{initials}</Text> : null}
            </View>
            <Text style={styles.heroPassStampLabel}>R4V3</Text>
          </View>

          <View style={styles.heroHeaderMain}>
            <View style={styles.heroTagRow}>
              <View style={styles.heroTag}>
                <Text style={styles.heroTagText}>IDENTITY</Text>
              </View>
              <View style={[styles.heroTag, styles.heroTagMuted]}>
                <Text style={styles.heroTagTextMuted}>{profileDraft.communityModeEnabled ? "DISCOVERY ON" : "DISCOVERY OFF"}</Text>
              </View>
            </View>

            <Text style={styles.heroTitle}>{profileDraft.displayName.trim() || "Create your profile"}</Text>
            <Text style={styles.heroSubtitle}>
              {[ageText !== "—" ? ageText : null, profileDraft.city.trim() || "City not set"].filter(Boolean).join(" • ")}
            </Text>
            <View style={styles.chipGrid}>
              {identityChips.length > 0 ? identityChips.map((tag) => <Chip key={`id-${tag}`} label={tag} selected />) : <Chip label="Add genres + vibes" />}
            </View>
          </View>
        </View>

        <View style={styles.progressModule}>
          <View style={styles.progressHeaderRow}>
            <View style={styles.progressCopy}>
              <Text style={styles.progressLabel}>Crew Readiness</Text>
              <Text style={styles.progressTitle}>{crewReadinessPct}% Complete</Text>
              <Text style={styles.progressSubtitle}>Finish your profile to start matching</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(6, crewReadinessPct)}%` }]} />
          </View>
          <View style={styles.readinessChecklist}>
            <ReadinessItem label="Add 1 photo →" complete={crewReadinessChecks.photo} onPress={() => handleReadinessPress("photo")} />
            <ReadinessItem label="Add bio →" complete={crewReadinessChecks.bio} onPress={() => handleReadinessPress("bio")} />
            <ReadinessItem label="Pick 1 vibe →" complete={crewReadinessChecks.vibes} onPress={() => handleReadinessPress("vibes")} />
            <ReadinessItem label="Pick 1 genre →" complete={crewReadinessChecks.genres} onPress={() => handleReadinessPress("genres")} />
            <ReadinessItem label="Accept guidelines →" complete={crewReadinessChecks.guidelines} onPress={() => handleReadinessPress("guidelines")} />
          </View>
          {!isCrewReadinessComplete ? (
            <Text style={styles.panelFootnote}>Unlock event-based matching by completing the steps above.</Text>
          ) : null}
        </View>

        <View style={styles.heroActionRow}>
          <Pressable style={styles.heroPrimaryButton} onPress={() => scrollTo(crewSignalsY)}>
            <Text style={styles.heroPrimaryButtonText}>Complete Profile</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.heroMetricsRow}>
        <MiniStat label="Photos" value={`${photoSlots.filter(Boolean).length}/6`} />
        <MiniStat label="Vibes" value={`${profileDraft.vibeTags.length}`} />
        <MiniStat label="Genres" value={`${profileDraft.musicGenres.length}`} />
      </View>
      <View onLayout={(event) => setCrewSignalsY(event.nativeEvent.layout.y)} />

      <Panel title="Photos" subtitle="Show people who they are meeting">
        <Pressable style={styles.photoEditCta} onPress={() => navigation.navigate("ProfilePhotos")}>
          <View style={styles.photoEditCopy}>
            <Text style={styles.photoEditTitle}>Edit Photos</Text>
            <Text style={styles.photoEditSubtitle}>{photoSlots.filter(Boolean).length}/6 added</Text>
          </View>
          <Text style={styles.photoEditAction}>Manage</Text>
        </Pressable>
      </Panel>

      <Panel title="Bio" subtitle="What kind of meetup do you like?">
        <View style={styles.bioBubbleCard} onLayout={(event) => setBioSectionY(event.nativeEvent.layout.y)}>
          <View style={styles.bioBubbleHeader}>
            <Text style={styles.bioBubbleTitle}>About you</Text>
            <Text style={styles.bioBubbleMeta}>{profileDraft.bio.trim().length}/240</Text>
          </View>
          <TextInput
            value={profileDraft.bio}
            onChangeText={(bio) => updateProfileDraft({ bio })}
            placeholder="Chill pregame, doors open, afters, sober-friendly, favorite sets, boundaries, and what you're looking for."
            placeholderTextColor="rgba(255,249,239,0.34)"
            style={styles.bioBubbleInput}
            multiline
            maxLength={240}
          />
        </View>
      </Panel>

      <Panel title="Crew Signals" subtitle="What you want your crew to feel like">
        <Text style={styles.infoSectionLabel}>Crew Mood</Text>
        <View style={styles.crewSignalSpotlightGrid}>
          {crewSignalSpotlightCards.map((option) => {
            const selected = profileDraft.vibeTags.includes(option.label);
            return (
              <Pressable
                key={option.label}
                onPress={() => toggleVibeTag(option.label)}
                style={[
                  styles.crewSignalSpotlightCard,
                  option.palette,
                  selected && styles.crewSignalSpotlightCardSelected
                ]}
              >
                <View style={[styles.crewSignalSpotlightOrb, { backgroundColor: option.palette.orb }]} />
                <View style={[styles.crewSignalSpotlightBeam, { backgroundColor: option.palette.beam }]} />
                <View style={styles.crewSignalSpotlightTopRow}>
                  <View style={styles.crewSignalSpotlightTextWrap}>
                    <Text style={styles.crewSignalSpotlightTitle}>{option.label}</Text>
                    <Text style={styles.crewSignalSpotlightSubtitle}>{option.subtitle}</Text>
                  </View>
                  <View style={[styles.crewSignalSpotlightBadge, selected && styles.crewSignalSpotlightBadgeSelected]}>
                    <Text style={[styles.crewSignalSpotlightBadgeText, selected && styles.crewSignalSpotlightBadgeTextSelected]}>
                      {option.glyph}
                    </Text>
                  </View>
                </View>
                <View style={styles.crewSignalSpotlightFooter}>
                  <CrewSignalIcon variant={option.iconVariant} selected={selected} />
                  <Text style={[styles.crewSignalSpotlightAction, selected && styles.crewSignalSpotlightActionSelected]}>
                    {selected ? "Selected" : "Tap to choose"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.infoSectionLabel}>Crew Vibes</Text>
        <View style={styles.chipGrid}>
          {visibleVibeOptions.filter((tag) => !crewSignalSpotlightCards.some((card) => card.label === tag)).map((tag) => (
            <Chip key={tag} label={tag} selected={profileDraft.vibeTags.includes(tag)} onPress={() => toggleVibeTag(tag)} />
          ))}
        </View>
        {vibeOptions.length > 4 ? (
          <Pressable style={styles.linkRow} onPress={() => setShowAllVibes((prev) => !prev)}>
            <Text style={styles.linkText}>{showAllVibes ? "Show less" : "Show more"}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.infoSectionLabel}>Genres</Text>
        <View style={styles.chipGrid}>
          {visibleGenreOptions.map((tag) => (
            <Chip key={tag} label={tag} selected={profileDraft.musicGenres.includes(tag)} onPress={() => toggleGenre(tag)} />
          ))}
        </View>
        {genreOptions.length > 4 ? (
          <Pressable style={styles.linkRow} onPress={() => setShowAllGenres((prev) => !prev)}>
            <Text style={styles.linkText}>{showAllGenres ? "Show less" : "Show more"}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.infoSectionLabel}>Crew Size</Text>
        <View style={styles.chipGrid}>
          {["Solo", "1-2", "3-5", "6+"].map((option) => (
            <Chip
              key={option}
              label={option}
              selected={profileDraft.crewStyle === option}
              onPress={() => updateProfileDraft({ crewStyle: profileDraft.crewStyle === option ? "" : option })}
            />
          ))}
        </View>
      </Panel>

      <Panel title="Basics" subtitle="Just the essentials">
        <View style={styles.infoCardList}>
          <InfoReadOnlyRow
            label="Location"
            value={`📍 ${profileDraft.city?.trim() || "City not set"}`}
            helper="Used for nearby events & crews"
          />
          <Button
            label={isCapturingLocation ? "Updating..." : "Update Location"}
            onPress={() => void handleCaptureLocation()}
            disabled={isCapturingLocation}
            variant="secondary"
          />
        </View>

        <View style={styles.quickInfoGrid}>
          <QuickInfo label="First name" value={profileDraft.displayName || "Not set"} />
          <QuickInfo label="Age" value={ageText} />
        </View>
        <View style={styles.infoCardList}>
          <InfoSelectRow
            label="Gender"
            value={profileDraft.gender || "Not set"}
            onPress={() => setActivePicker("gender")}
          />
        </View>
      </Panel>

      <Panel title="Match Preferences" subtitle="Filter who appears in your stack">
        <View style={styles.infoCardList}>
          <InfoMultiSelectRow
            label="Interested in"
            value={normalizedInterestedGenders.length > 0 ? normalizedInterestedGenders.join(", ") : "Everyone"}
            helper="Only matching profiles will appear in your stack."
            onPress={() => setIsInterestedGenderModalOpen(true)}
          />
          <View style={styles.ageRangeCard}>
            <View style={styles.rangeHeader}>
              <Text style={styles.infoSectionLabel}>Age range</Text>
              <Text style={styles.rangeValue}>
                {formatPreferenceAge(profileDraft.preferredAgeMin ?? 21)} - {formatPreferenceAge(profileDraft.preferredAgeMax ?? 35)}
              </Text>
            </View>
            <View style={styles.sliderBlock}>
              <Text style={styles.agePrefLabel}>Minimum age</Text>
              <Slider
                minimumValue={MIN_AGE}
                maximumValue={MAX_AGE}
                step={1}
                minimumTrackTintColor={theme.colors.accent}
                maximumTrackTintColor={theme.colors.border}
                thumbTintColor={theme.colors.accent}
                value={profileDraft.preferredAgeMin ?? 21}
                onValueChange={(value) => {
                  const nextMin = Math.round(value);
                  updateProfileDraft({
                    preferredAgeMin: nextMin,
                    preferredAgeMax: Math.max(profileDraft.preferredAgeMax ?? nextMin, nextMin)
                  });
                }}
              />
            </View>
            <View style={styles.sliderBlock}>
              <Text style={styles.agePrefLabel}>Maximum age</Text>
              <Slider
                minimumValue={MIN_AGE}
                maximumValue={MAX_AGE}
                step={1}
                minimumTrackTintColor={theme.colors.accent}
                maximumTrackTintColor={theme.colors.border}
                thumbTintColor={theme.colors.accent}
                value={profileDraft.preferredAgeMax ?? 35}
                onValueChange={(value) => {
                  const nextMax = Math.round(value);
                  updateProfileDraft({
                    preferredAgeMax: nextMax,
                    preferredAgeMin: Math.min(profileDraft.preferredAgeMin ?? nextMax, nextMax)
                  });
                }}
              />
            </View>
          </View>
        </View>
      </Panel>

      <View onLayout={(event) => setCrewSettingsY(event.nativeEvent.layout.y)}>
      <Panel title="Crew Discovery" subtitle="Control when you show up">
        <ToggleRow
          label="Appear in Crew Discovery"
          description={isCrewReadinessComplete ? "Shown when you opt into crewing for an event." : "Finish your profile to enable"}
          value={isCrewReadinessComplete ? profileDraft.communityModeEnabled : false}
          onPress={handleToggleOpenToCrewMatching}
          disabled={!isCrewReadinessComplete}
        />
        <ToggleRow
          label="Guidelines Accepted"
          description="Required for crew discovery."
          value={profileDraft.guidelinesAccepted}
          onPress={() => updateProfileDraft({ guidelinesAccepted: !profileDraft.guidelinesAccepted })}
        />
        {!profileDraft.guidelinesAccepted ? (
          <Button
            label="Review Guidelines"
            variant="ghost"
            onPress={() =>
              Alert.alert(
                "Community Guidelines",
                "Accept the guidelines before turning on crew discovery."
              )
            }
          />
        ) : null}
      </Panel>
      </View>

          <Panel title="Account">
            {profileSaveStatus === "saving" ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.statusText}>Saving profile...</Text>
              </View>
            ) : null}
            {profileSaveStatus === "saved" ? <Text style={styles.successText}>Profile saved.</Text> : null}
            {profileSaveError ? <Text style={styles.errorText}>{profileSaveError}</Text> : null}
            {crewReadinessLockedReason ? <Text style={styles.panelFootnote}>Complete the checklist above to start meeting people going to your events.</Text> : null}

            <View style={styles.buttonStack}>
              {isModerator ? (
                <>
                  <Button label="Moderation Queue" variant="secondary" onPress={() => navigation.navigate("ModerationQueue")} />
                  <Button label="Analytics" variant="secondary" onPress={() => navigation.navigate("AdminAnalytics")} />
                  <Button label="Event Curation" variant="secondary" onPress={() => navigation.navigate("EventCuration")} />
                  <Button label="Scraper Status" variant="secondary" onPress={() => navigation.navigate("ScraperStatus")} />
                  <Button label="System Alerts" variant="secondary" onPress={() => navigation.navigate("SystemAlerts")} />
                </>
              ) : null}
              <Button label="Save Profile" variant="secondary" onPress={() => void saveProfileDraft()} />
              <Button label="Sign Out" variant="ghost" onPress={() => void signOut()} />
              <Button label="Delete Account" variant="ghost" onPress={() => setIsDeleteModalOpen(true)} />
            </View>
          </Panel>
        </ScrollView>
        <DeleteAccountModal
          visible={isDeleteModalOpen}
          value={deleteConfirmationText}
          isDeleting={isDeletingAccount}
          onChangeText={setDeleteConfirmationText}
          onClose={() => {
            if (isDeletingAccount) return;
            setDeleteConfirmationText("");
            setIsDeleteModalOpen(false);
          }}
          onConfirm={() => void handleDeleteAccount()}
        />
        {activePickerConfig ? (
          <OptionPickerModal
            visible={Boolean(activePickerConfig)}
            title={activePickerConfig.title}
            options={activePickerConfig.options}
            selectedValue={activePickerConfig.value}
            onClose={() => setActivePicker(null)}
            onSelect={activePickerConfig.onSelect}
          />
        ) : null}
        <MultiSelectModal
          visible={isInterestedGenderModalOpen}
          title="Interested in"
          options={[...matchPreferenceOptions]}
          selected={normalizedInterestedGenders.length > 0 ? normalizedInterestedGenders : ["Everyone"]}
          onClose={() => setIsInterestedGenderModalOpen(false)}
          onToggle={(value) => {
            updateProfileDraft({
              interestedGenders: value === "Everyone" ? [] : [value]
            });
          }}
        />
      </>
    </KeyboardAvoidingView>
  );
}

function Panel(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.panelSubtitle}>{props.subtitle}</Text> : null}
      </View>
      <View style={styles.panelBody}>{props.children}</View>
    </View>
  );
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{props.value}</Text>
      <Text style={styles.miniStatLabel}>{props.label}</Text>
    </View>
  );
}

function ReadinessItem(props: { label: string; complete: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.readinessItem}>
      <Text style={[styles.readinessIcon, props.complete ? styles.readinessIconComplete : styles.readinessIconIncomplete]}>
        {props.complete ? "✔" : "✘"}
      </Text>
      <Text style={styles.readinessLabel}>{props.label}</Text>
    </Pressable>
  );
}

function CrewSignalIcon(props: { variant: "pair" | "radar" | "chill"; selected: boolean }) {
  if (props.variant === "pair") {
    return (
      <View style={styles.crewSignalIconPairWrap}>
        <View style={[styles.crewSignalIconPairPerson, props.selected && styles.crewSignalIconPairPersonSelected]}>
          <View style={[styles.crewSignalIconPairHead, props.selected && styles.crewSignalIconPairHeadSelected]} />
          <View style={[styles.crewSignalIconPairBody, props.selected && styles.crewSignalIconPairBodySelected]} />
        </View>
        <View style={[styles.crewSignalIconPairPerson, props.selected && styles.crewSignalIconPairPersonSelected]}>
          <View style={[styles.crewSignalIconPairHead, props.selected && styles.crewSignalIconPairHeadSelected]} />
          <View style={[styles.crewSignalIconPairBody, props.selected && styles.crewSignalIconPairBodySelected]} />
        </View>
      </View>
    );
  }

  if (props.variant === "chill") {
    return (
      <View style={styles.crewSignalIconChillWrap}>
        <View style={[styles.crewSignalIconMoon, props.selected && styles.crewSignalIconMoonSelected]} />
        <View style={styles.crewSignalIconMoonCutout} />
      </View>
    );
  }

  return (
    <View style={styles.crewSignalIconRadarWrap}>
      <View style={[styles.crewSignalIconRadarRingOuter, props.selected && styles.crewSignalIconRadarRingOuterSelected]} />
      <View style={[styles.crewSignalIconRadarRingInner, props.selected && styles.crewSignalIconRadarRingInnerSelected]} />
      <View style={[styles.crewSignalIconRadarCore, props.selected && styles.crewSignalIconRadarCoreSelected]} />
      <View style={[styles.crewSignalIconRadarSweep, props.selected && styles.crewSignalIconRadarSweepSelected]} />
      <View style={[styles.crewSignalIconRadarBlip, props.selected && styles.crewSignalIconRadarBlipSelected]} />
    </View>
  );
}

function QuickInfo(props: { label: string; value: string }) {
  return (
    <View style={styles.quickInfoTile}>
      <Text style={styles.quickInfoLabel}>{props.label}</Text>
      <Text style={styles.quickInfoValue} numberOfLines={2}>
        {props.value}
      </Text>
    </View>
  );
}

function InfoInputRow(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.infoRowCard}>
      <Text style={styles.infoRowLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="rgba(255,249,239,0.38)"
        style={styles.infoRowInput}
      />
    </View>
  );
}

function InfoReadOnlyRow(props: { label: string; value: string; helper?: string }) {
  return (
    <View style={styles.infoRowCard}>
      <Text style={styles.infoRowLabel}>{props.label}</Text>
      <Text style={styles.infoRowValue}>{props.value}</Text>
      {props.helper ? <Text style={styles.infoRowHelper}>{props.helper}</Text> : null}
    </View>
  );
}

function InfoSelectRow(props: { label: string; value: string; onPress: () => void; helper?: string }) {
  return (
    <Pressable onPress={props.onPress} style={styles.infoRowCard}>
      <View style={styles.infoRowHeaderLine}>
        <Text style={styles.infoRowLabel}>{props.label}</Text>
        <Text style={styles.infoRowChevron}>›</Text>
      </View>
      <Text style={styles.infoRowValue}>{props.value}</Text>
      {props.helper ? <Text style={styles.infoRowHelper}>{props.helper}</Text> : null}
    </Pressable>
  );
}

function InfoMultiSelectRow(props: { label: string; value: string; onPress: () => void; helper?: string }) {
  return <InfoSelectRow {...props} />;
}

function OptionPickerModal(props: {
  visible: boolean;
  title: string;
  options: string[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.modalScrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{props.title}</Text>
            <Pressable onPress={props.onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalOptionsList} contentContainerStyle={styles.modalOptionsContent}>
            {props.options.map((option) => {
              const selected = option === props.selectedValue;
              return (
                <Pressable
                  key={option}
                  onPress={() => props.onSelect(option)}
                  style={[styles.modalOptionRow, selected && styles.modalOptionRowSelected]}
                >
                  <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>{option}</Text>
                  {selected ? <Text style={styles.modalCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MultiSelectModal(props: {
  visible: boolean;
  title: string;
  options: string[];
  selected: string[];
  onClose: () => void;
  onToggle: (value: string) => void;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.modalScrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{props.title}</Text>
            <Pressable onPress={props.onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalOptionsList} contentContainerStyle={styles.modalOptionsContent}>
            {props.options.map((option) => {
              const selected = props.selected.includes(option);
              return (
                <Pressable
                  key={option}
                  onPress={() => props.onToggle(option)}
                  style={[styles.modalOptionRow, selected && styles.modalOptionRowSelected]}
                >
                  <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>{option}</Text>
                  {selected ? <Text style={styles.modalCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ZodiacMultiSelectModal(props: {
  visible: boolean;
  selected: string[];
  onClose: () => void;
  onToggle: (value: string) => void;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.modalScrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select zodiac sign(s)</Text>
            <Pressable onPress={props.onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalOptionsList} contentContainerStyle={styles.modalOptionsContent}>
            {zodiacOptions.map((option) => {
              const selected = props.selected.includes(option);
              return (
                <Pressable
                  key={option}
                  onPress={() => props.onToggle(option)}
                  style={[styles.modalOptionRow, selected && styles.modalOptionRowSelected]}
                >
                  <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>{option}</Text>
                  {selected ? <Text style={styles.modalCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DeleteAccountModal(props: {
  visible: boolean;
  value: string;
  isDeleting: boolean;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.modalScrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Delete account</Text>
            <Pressable onPress={props.onClose} style={styles.modalCloseBtn} disabled={props.isDeleting}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>

          <View style={styles.deleteModalBody}>
            <Text style={styles.deleteModalBodyText}>
              This permanently deletes your profile, photos, RSVPs, matches, and messages. Type DELETE to continue.
            </Text>
            <TextInput
              value={props.value}
              onChangeText={props.onChangeText}
              placeholder="Type DELETE"
              placeholderTextColor="rgba(255,249,239,0.36)"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!props.isDeleting}
              style={styles.deleteModalInput}
            />
            <Button
              label={props.isDeleting ? "Deleting..." : "Permanently Delete"}
              variant="ghost"
              loading={props.isDeleting}
              disabled={props.value.trim().toUpperCase() !== "DELETE"}
              onPress={props.onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FieldRow(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="rgba(255,249,239,0.36)"
        style={styles.fieldInput}
      />
    </View>
  );
}

function ToggleRow(props: { label: string; description: string; value: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={props.onPress} disabled={props.disabled} style={[styles.toggleRow, props.disabled && styles.toggleRowDisabled]}>
      <View style={styles.toggleTextWrap}>
        <Text style={[styles.toggleLabel, props.disabled && styles.toggleLabelDisabled]}>{props.label}</Text>
        <Text style={[styles.toggleDescription, props.disabled && styles.toggleDescriptionDisabled]}>{props.description}</Text>
      </View>
      <View style={[styles.toggleTrack, props.value && styles.toggleTrackOn, props.disabled && styles.toggleTrackDisabled]}>
        <View style={[styles.toggleThumb, props.value && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  },
  scroll: {
    flex: 1,
    backgroundColor: "#11100D"
  },
  container: {
    paddingHorizontal: 12,
    gap: 22,
    backgroundColor: "#11100D"
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.035)",
    backgroundColor: "#100D0A",
    padding: 15,
    gap: 14,
    overflow: "hidden"
  },
  heroNoiseBand: {
    position: "absolute",
    left: -20,
    right: -20,
    top: 34,
    height: 20,
    backgroundColor: "rgba(211,92,51,0.12)",
    transform: [{ rotate: "-5deg" }]
  },
  heroGridLineA: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    right: -50,
    top: -34
  },
  heroGridLineB: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    right: -14,
    top: 18
  },
  heroPassTop: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  heroPassStamp: {
    width: 104,
    alignItems: "center",
    gap: 6
  },
  heroAvatarFrame: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.26)",
    backgroundColor: "rgba(211,92,51,0.06)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden"
  },
  heroCoverImage: {
    ...StyleSheet.absoluteFillObject
  },
  heroCoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)"
  },
  heroPassStampLabel: {
    color: "rgba(255,240,232,0.72)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7
  },
  heroPassStampValue: {
    color: "#FFF8EE",
    fontSize: 24,
    fontWeight: "900"
  },
  heroPassMain: {
    flex: 1,
    gap: 10
  },
  heroHeaderMain: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
    paddingVertical: 2
  },
  heroTagRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap"
  },
  heroTag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.24)",
    backgroundColor: "rgba(211,92,51,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  heroTagMuted: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  heroTagText: {
    color: "#FFD6C7",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4
  },
  heroTagTextMuted: {
    color: "rgba(255,249,239,0.75)",
    fontSize: 10,
    fontWeight: "700"
  },
  heroActionRow: {
    gap: 8,
    marginTop: 2
  },
  heroPrimaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.26)",
    backgroundColor: "#C24A22",
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  heroPrimaryButtonText: {
    color: "#FFF8EE",
    fontWeight: "700",
    fontSize: 13
  },
  heroSecondaryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    minHeight: 22
  },
  heroSecondaryLinkLabel: {
    color: "rgba(255,249,239,0.76)",
    fontSize: 13,
    fontWeight: "600"
  },
  heroSecondaryLinkAction: {
    color: "#FFD4C4",
    fontWeight: "700",
    fontSize: 13
  },
  photoEditCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.24)",
    backgroundColor: "rgba(211,92,51,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  photoEditCopy: {
    gap: 2
  },
  photoEditTitle: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  photoEditSubtitle: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 12
  },
  photoEditAction: {
    color: "#FFD4C4",
    fontSize: 13,
    fontWeight: "800"
  },
  heroTitle: {
    color: "#FFF8EE",
    ...theme.type.titleLg,
    fontSize: 17
  },
  heroSubtitle: {
    color: "rgba(255,249,239,0.68)",
    fontSize: 12,
    lineHeight: 16
  },
  progressModule: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 12,
    gap: 8
  },
  progressHeaderRow: {
    gap: 8
  },
  progressCopy: {
    gap: 2
  },
  progressLabel: {
    color: "rgba(255,249,239,0.7)",
    fontSize: 12,
    fontWeight: "700"
  },
  progressTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  progressSubtitle: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 12,
    lineHeight: 17
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#D35C33"
  },
  readinessChecklist: {
    gap: 6
  },
  readinessItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  readinessIcon: {
    fontSize: 12,
    fontWeight: "800"
  },
  readinessIconComplete: {
    color: "#B9F0C8"
  },
  readinessIconIncomplete: {
    color: "#FF9F9F"
  },
  readinessLabel: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "600"
  },
  heroMetricsRow: {
    flexDirection: "row",
    gap: 10
  },
  miniStat: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
    backgroundColor: "#12100C",
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  miniStatValue: {
    color: "#FFF8EE",
    fontWeight: "800",
    fontSize: 14
  },
  miniStatLabel: {
    color: "rgba(255,249,239,0.55)",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2
  },
  quickInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  quickInfoTile: {
    width: "48.5%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 11,
    gap: 5
  },
  quickInfoLabel: {
    color: "rgba(255,249,239,0.55)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35
  },
  quickInfoValue: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.035)",
    backgroundColor: "#0F0D0A",
    padding: 15,
    gap: 15,
    overflow: "hidden"
  },
  panelHeader: {
    gap: 4
  },
  panelTitle: {
    color: "#FFFDF8",
    fontSize: 18,
    fontWeight: "800"
  },
  panelSubtitle: {
    color: "rgba(255,249,239,0.6)",
    fontSize: 12,
    lineHeight: 16
  },
  infoSectionLabel: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  infoCardList: {
    gap: 12
  },
  chipCloud: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  crewSignalSpotlightGrid: {
    gap: 10
  },
  crewSignalSpotlightCard: {
    position: "relative",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    overflow: "hidden"
  },
  crewSignalSpotlightCardSelected: {
    borderColor: "rgba(211,92,51,0.44)",
    backgroundColor: "rgba(211,92,51,0.14)"
  },
  crewSignalSpotlightOrb: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    right: -18,
    top: -22
  },
  crewSignalSpotlightBeam: {
    position: "absolute",
    width: 180,
    height: 30,
    left: -30,
    bottom: 14,
    transform: [{ rotate: "-8deg" }]
  },
  crewSignalSpotlightTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  crewSignalSpotlightTextWrap: {
    flex: 1,
    gap: 4
  },
  crewSignalSpotlightBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,249,239,0.08)",
    backgroundColor: "rgba(255,249,239,0.04)",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  crewSignalSpotlightBadgeSelected: {
    borderColor: "rgba(255,220,206,0.22)",
    backgroundColor: "rgba(255,220,206,0.08)"
  },
  crewSignalSpotlightBadgeText: {
    color: "rgba(255,249,239,0.54)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5
  },
  crewSignalSpotlightBadgeTextSelected: {
    color: "#FFE4D9"
  },
  crewSignalSpotlightTitle: {
    color: "#FFF8EE",
    fontSize: 15,
    fontWeight: "800"
  },
  crewSignalSpotlightSubtitle: {
    color: "rgba(255,249,239,0.58)",
    fontSize: 12,
    fontStyle: "italic"
  },
  crewSignalSpotlightFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  crewSignalIconPairWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  crewSignalIconPairPerson: {
    alignItems: "center",
    gap: 2
  },
  crewSignalIconPairPersonSelected: {},
  crewSignalIconPairHead: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.46)"
  },
  crewSignalIconPairHeadSelected: {
    backgroundColor: "#FFE3D7"
  },
  crewSignalIconPairBody: {
    width: 12,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.28)"
  },
  crewSignalIconPairBodySelected: {
    backgroundColor: "rgba(255,227,215,0.82)"
  },
  crewSignalIconRadarWrap: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  crewSignalIconRadarRingOuter: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255,249,239,0.28)"
  },
  crewSignalIconRadarRingOuterSelected: {
    borderColor: "#FFE3D7"
  },
  crewSignalIconRadarRingInner: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255,249,239,0.22)"
  },
  crewSignalIconRadarRingInnerSelected: {
    borderColor: "rgba(255,227,215,0.84)"
  },
  crewSignalIconRadarCore: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.50)"
  },
  crewSignalIconRadarCoreSelected: {
    backgroundColor: "#FFE3D7"
  },
  crewSignalIconRadarSweep: {
    position: "absolute",
    width: 12,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.34)",
    transform: [{ rotate: "-28deg" }, { translateX: 5 }]
  },
  crewSignalIconRadarSweepSelected: {
    backgroundColor: "#FFE3D7"
  },
  crewSignalIconRadarBlip: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.38)",
    right: 5,
    top: 6
  },
  crewSignalIconRadarBlipSelected: {
    backgroundColor: "#FFE3D7"
  },
  crewSignalIconChillWrap: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  crewSignalIconMoon: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.44)"
  },
  crewSignalIconMoonSelected: {
    backgroundColor: "#FFE3D7"
  },
  crewSignalIconMoonCutout: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: "#0F0D0A",
    right: 4,
    top: 5
  },
  crewSignalSpotlightAction: {
    color: "rgba(255,249,239,0.54)",
    fontSize: 11,
    fontWeight: "700"
  },
  crewSignalSpotlightActionSelected: {
    color: "#FFE1D5"
  },
  ageRangeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    backgroundColor: "#14110D",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12
  },
  rangeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  rangeValue: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "700"
  },
  sliderBlock: {
    gap: 8
  },
  agePrefLabel: {
    color: "rgba(255,249,239,0.56)",
    fontSize: 12,
    fontWeight: "600"
  },
  infoRowCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    backgroundColor: "#14110D",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 5
  },
  infoRowHeaderLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  infoRowLabel: {
    color: "rgba(255,249,239,0.56)",
    fontSize: 12,
    fontWeight: "600"
  },
  infoRowInput: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "700",
    paddingVertical: 2
  },
  infoRowValue: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "700"
  },
  infoRowHelper: {
    color: "rgba(255,249,239,0.48)",
    fontSize: 11,
    lineHeight: 15
  },
  infoRowChevron: {
    color: "rgba(255,249,239,0.42)",
    fontSize: 22,
    lineHeight: 22,
    marginTop: -2
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#0F0D0A",
    paddingTop: 10,
    maxHeight: "68%"
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)"
  },
  modalTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  modalCloseBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.32)",
    backgroundColor: "rgba(211,92,51,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  modalCloseText: {
    color: "#FFF8EE",
    fontWeight: "700",
    fontSize: 12
  },
  modalOptionsList: {
    flexGrow: 0
  },
  modalOptionsContent: {
    padding: 12,
    gap: 8
  },
  deleteModalBody: {
    padding: 14,
    gap: 12
  },
  deleteModalBodyText: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 13,
    lineHeight: 19
  },
  deleteModalInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#14110D",
    color: "#FFF8EE",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "700",
    letterSpacing: 0.8
  },
  modalOptionRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#14110D",
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  modalOptionRowSelected: {
    borderColor: "rgba(211,92,51,0.35)",
    backgroundColor: "rgba(211,92,51,0.10)"
  },
  modalOptionText: {
    color: "#FFF8EE",
    fontSize: 15,
    fontWeight: "600"
  },
  modalOptionTextSelected: {
    fontWeight: "800"
  },
  modalCheck: {
    color: "#FFD5C3",
    fontWeight: "800"
  },
  expandHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  expandHeaderCopy: {
    flex: 1,
    gap: 3
  },
  expandChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  expandChipText: {
    color: "#FFF8EE",
    fontSize: 11,
    fontWeight: "700"
  },
  expandChipArrow: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 11,
    fontWeight: "700"
  },
  panelBody: {
    gap: 14
  },
  bioBubbleCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.1)",
    backgroundColor: "#120E0A",
    padding: 13,
    gap: 9
  },
  bioBubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  bioBubbleTitle: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  bioBubbleMeta: {
    color: "rgba(255,249,239,0.5)",
    fontSize: 10,
    fontWeight: "700"
  },
  bioBubbleInput: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.02)",
    color: "#FFF8EE",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 19,
    textAlignVertical: "top"
  },
  photoCollapsedWrap: {
    gap: 10
  },
  photoCollapsedRow: {
    flexDirection: "row",
    gap: 10
  },
  photoPreviewTile: {
    flex: 1,
    aspectRatio: 1.05,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  photoPreviewText: {
    color: "#FFF8EE",
    fontWeight: "800",
    fontSize: 12
  },
  photoPreviewPlus: {
    color: "rgba(255,249,239,0.6)",
    fontSize: 22,
    lineHeight: 22
  },
  panelFootnote: {
    color: "rgba(255,249,239,0.52)",
    fontSize: 11,
    lineHeight: 16
  },
  linkRow: {
    alignSelf: "flex-start"
  },
  linkText: {
    color: "rgba(255,220,202,0.72)",
    ...theme.type.caption,
    fontWeight: "600"
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "flex-start",
    alignContent: "flex-start"
  },
  photoTile: {
    width: "30.6%",
    aspectRatio: 0.95,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    gap: 6
  },
  photoTilePrimary: {
    borderColor: "rgba(211,92,51,0.34)",
    backgroundColor: "rgba(211,92,51,0.05)"
  },
  photoTileFilled: {
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#221A14",
    overflow: "hidden"
  },
  photoTileFillGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 999,
    backgroundColor: "rgba(194,74,34,0.22)"
  },
  photoImage: {
    ...StyleSheet.absoluteFillObject
  },
  photoTilePlus: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 26,
    lineHeight: 26
  },
  photoTileLabel: {
    color: "#EDE2D2",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center"
  },
  photoTileFilledText: {
    color: "#FFF8EE",
    fontWeight: "800",
    fontSize: 12
  },
  photoTileHint: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 10
  },
  fieldRow: {
    gap: 6
  },
  fieldLabel: {
    color: "#FFF8EE",
    fontSize: 12,
    fontWeight: "700"
  },
  fieldInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#221D16",
    color: "#FFF8EE",
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  readOnlyField: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 3
  },
  readOnlyFieldValue: {
    color: "#FFF8EE",
    fontWeight: "600"
  },
  readOnlyFieldHelper: {
    color: "rgba(255,249,239,0.52)",
    fontSize: 11,
    lineHeight: 15
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  toggleRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    backgroundColor: "#221D16",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  toggleRowDisabled: {
    opacity: 0.72
  },
  toggleTextWrap: {
    flex: 1,
    gap: 3
  },
  toggleLabel: {
    color: "#FFF8EE",
    fontWeight: "700"
  },
  toggleLabelDisabled: {
    color: "rgba(255,249,239,0.78)"
  },
  toggleDescription: {
    color: "rgba(255,249,239,0.6)",
    fontSize: 12
  },
  toggleDescriptionDisabled: {
    color: "rgba(255,249,239,0.52)"
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#6F6457",
    padding: 3,
    justifyContent: "center"
  },
  toggleTrackOn: {
    backgroundColor: "#C24A22"
  },
  toggleTrackDisabled: {
    backgroundColor: "#53493D"
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#FFF2E2"
  },
  toggleThumbOn: {
    alignSelf: "flex-end"
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  statusText: {
    color: "rgba(255,249,239,0.66)"
  },
  successText: {
    color: "#B9F0C8",
    fontWeight: "600"
  },
  errorText: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  buttonStack: {
    gap: 10
  }
});

function ReadOnlyFieldRow(props: { label: string; value: string; helper?: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <View style={styles.readOnlyField}>
        <Text style={styles.readOnlyFieldValue}>{props.value}</Text>
        {props.helper ? <Text style={styles.readOnlyFieldHelper}>{props.helper}</Text> : null}
      </View>
    </View>
  );
}

function formatAgeFromBirthdate(birthdate: string) {
  if (!birthdate.trim()) return "Not set";
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return "Invalid birthdate";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? `${age}` : "Invalid birthdate";
}

function formatPreferenceAge(value: number) {
  return value >= MAX_AGE ? `${MAX_AGE}+` : String(value);
}

function parseCsvList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildHeightOptions() {
  const values: string[] = [];
  for (let feet = 4; feet <= 7; feet += 1) {
    for (let inches = 0; inches <= 11; inches += 1) {
      if (feet === 4 && inches < 8) continue;
      if (feet === 7 && inches > 0) continue;
      values.push(`${feet}'${inches}"`);
    }
  }
  return values;
}
