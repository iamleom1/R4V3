import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../app/AppProvider";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { theme } from "../../theme";
import { captureCurrentDeviceLocation } from "./deviceLocationService";
import { listProfilePhotos, type ProfilePhoto } from "./photoRepository";
import { isCurrentUserModerator } from "./moderationRepository";
import type { ProfileStackParamList } from "./ProfileNavigator";

const vibeOptions = ["Solo-friendly", "Small crew", "Open crew", "Sober-friendly", "Stick together", "Chill meetup", "Afters", "First-timer friendly"];
const genreOptions = ["House", "Techno", "Trance", "DnB", "Dubstep", "UKG", "Hardgroove", "Disco"];
const pronounOptions = ["she/her", "he/him", "they/them", "she/they", "he/they", "any pronouns", "prefer not to say"];
const genderOptions = ["Woman", "Man", "Non-binary", "Trans woman", "Trans man", "Genderfluid", "Prefer not to say"];
const smokingOptions = ["Never", "Occasionally", "Socially", "Regularly", "Prefer not to say"];
const drinkingOptions = ["Never", "Rarely", "Socially", "Often", "Sober", "Prefer not to say"];
const zodiacOptions = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];
const heightOptions = buildHeightOptions();

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { session, profileDraft, profileSaveStatus, profileSaveError, updateProfileDraft, saveProfileDraft, signOut } = useAppState();
  const [photoSlots, setPhotoSlots] = useState<Array<ProfilePhoto | null>>([null, null, null, null, null, null]);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const [crewSignalsY, setCrewSignalsY] = useState(0);
  const [showAllVibes, setShowAllVibes] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [activePicker, setActivePicker] = useState<null | "height" | "pronouns" | "gender" | "smoking" | "drinking">(null);
  const [isZodiacModalOpen, setIsZodiacModalOpen] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const isNameLocked = profileDraft.onboardingCompleted && profileDraft.displayName.trim().length > 0;
  const isAgeLocked = profileDraft.onboardingCompleted && profileDraft.birthdate.trim().length > 0;
  const hasPhoto = photoSlots.some((slot) => Boolean(slot));
  const hasShortBio = profileDraft.bio.trim().length >= 20;
  const hasGenre = profileDraft.musicGenres.length > 0;
  const crewReadinessChecks = useMemo(
    () => ({
      photo: hasPhoto,
      bio: hasShortBio,
      genre: hasGenre,
      guidelines: profileDraft.guidelinesAccepted
    }),
    [hasGenre, hasPhoto, hasShortBio, profileDraft.guidelinesAccepted]
  );
  const crewReadinessCount = Object.values(crewReadinessChecks).filter(Boolean).length;
  const crewReadinessPct = Math.round((crewReadinessCount / 4) * 100);
  const crewReadinessLockedReason =
    crewReadinessCount === 4
      ? null
      : "Crew matching is locked until you add 1+ photo, a short bio, 1+ genre, and accept guidelines.";

  const ageText = useMemo(() => formatAgeFromBirthdate(profileDraft.birthdate), [profileDraft.birthdate]);
  const selectedZodiacSigns = useMemo(() => parseCsvList(profileDraft.zodiac), [profileDraft.zodiac]);
  const identityChips = useMemo(
    () => [...profileDraft.musicGenres.slice(0, 2), ...profileDraft.vibeTags.slice(0, 1)],
    [profileDraft.musicGenres, profileDraft.vibeTags]
  );
  const coverPhotoUrl = photoSlots[0]?.url ?? "";

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
    if (next && crewReadinessCount < 4) {
      Alert.alert(
        "Complete profile first",
        "Add at least 1 photo, a short bio, 1+ genre, and accept guidelines before opening crew matching."
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

  const initials = useMemo(() => {
    const text = profileDraft.displayName.trim();
    if (!text) return "R4";
    return text
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [profileDraft.displayName]);

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
        options: genderOptions,
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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
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
            {coverPhotoUrl ? <Image source={{ uri: coverPhotoUrl }} style={styles.heroCoverImage} /> : null}
            <View style={styles.heroCoverOverlay} />
            <Text style={styles.heroPassStampLabel}>R4V3</Text>
            {!coverPhotoUrl ? <Text style={styles.heroPassStampValue}>{initials}</Text> : null}
          </View>

          <View style={styles.heroPassMain}>
            <View style={styles.heroTagRow}>
              <View style={styles.heroTag}>
                <Text style={styles.heroTagText}>IDENTITY</Text>
              </View>
              <View style={[styles.heroTag, styles.heroTagMuted]}>
                <Text style={styles.heroTagTextMuted}>{profileDraft.communityModeEnabled ? "CREW OPEN" : "CREW OFF"}</Text>
              </View>
            </View>

            <Text style={styles.heroTitle}>{profileDraft.displayName.trim() || "Create your profile"}</Text>
            <Text style={styles.heroSubtitle}>
              {[ageText !== "—" ? ageText : null, profileDraft.city.trim() || "City not set"].filter(Boolean).join(" • ")}
            </Text>
            <View style={styles.chipGrid}>
              {identityChips.length > 0 ? identityChips.map((tag) => <Chip key={`id-${tag}`} label={tag} selected />) : <Chip label="Add genres + vibes" />}
            </View>

            <View style={styles.heroActionRow}>
              <Pressable style={styles.heroActionButton} onPress={() => navigation.navigate("ProfilePhotos")}>
                <Text style={styles.heroActionButtonText}>Edit Photos</Text>
              </Pressable>
              <Pressable style={styles.heroGhostButton} onPress={() => scrollRef.current?.scrollTo({ y: crewSignalsY, animated: true })}>
                <Text style={styles.heroGhostButtonText}>Edit Profile</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.progressModule}>
          <View style={styles.progressHeaderRow}>
            <Text style={styles.progressLabel}>Crew Readiness</Text>
            <Text style={styles.progressPct}>{crewReadinessPct}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(6, crewReadinessPct)}%` }]} />
          </View>
          <View style={styles.progressTicksRow}>
            <View style={[styles.progressTick, crewReadinessChecks.photo && styles.progressTickOn]} />
            <View style={[styles.progressTick, crewReadinessChecks.bio && styles.progressTickOn]} />
            <View style={[styles.progressTick, crewReadinessChecks.genre && styles.progressTickOn]} />
            <View style={[styles.progressTick, crewReadinessChecks.guidelines && styles.progressTickOn]} />
          </View>
          <Text style={styles.panelFootnote}>
            Add 1 photo • Add a short bio • Pick 3 vibes • Pick 2 genres • Accept guidelines
          </Text>
        </View>

        <View style={styles.heroMetricsRow}>
          <MiniStat label="Photos" value={`${photoSlots.filter(Boolean).length}/6`} />
          <MiniStat label="Vibes" value={`${profileDraft.vibeTags.length}`} />
          <MiniStat label="Genres" value={`${profileDraft.musicGenres.length}`} />
        </View>
      </View>

      <View onLayout={(event) => setCrewSignalsY(event.nativeEvent.layout.y)} />

      <Panel title="Crew Signals" subtitle="Core signals for event-based crew matching">
        <Text style={styles.infoSectionLabel}>Crew Vibes</Text>
        <View style={styles.chipGrid}>
          {(showAllVibes ? vibeOptions : vibeOptions.slice(0, 6)).map((tag) => (
            <Chip key={tag} label={tag} selected={profileDraft.vibeTags.includes(tag)} onPress={() => toggleVibeTag(tag)} />
          ))}
        </View>
        {vibeOptions.length > 6 ? (
          <Pressable style={styles.linkRow} onPress={() => setShowAllVibes((prev) => !prev)}>
            <Text style={styles.linkText}>{showAllVibes ? "Show less" : "Show more"}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.infoSectionLabel}>Genres</Text>
        <View style={styles.chipGrid}>
          {(showAllGenres ? genreOptions : genreOptions.slice(0, 6)).map((tag) => (
            <Chip key={tag} label={tag} selected={profileDraft.musicGenres.includes(tag)} onPress={() => toggleGenre(tag)} />
          ))}
        </View>
        {genreOptions.length > 6 ? (
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

        <View style={styles.bioBubbleCard}>
          <View style={styles.bioBubbleHeader}>
            <Text style={styles.bioBubbleTitle}>Bio</Text>
            <Text style={styles.bioBubbleMeta}>{profileDraft.bio.trim().length}/240</Text>
          </View>
          <TextInput
            value={profileDraft.bio}
            onChangeText={(bio) => updateProfileDraft({ bio })}
            placeholder="What kind of meetup do you like? Chill pregame, doors open, afters, sober-friendly, etc."
            placeholderTextColor="rgba(255,249,239,0.34)"
            style={styles.bioBubbleInput}
            multiline
            maxLength={240}
          />
        </View>
      </Panel>

      <Panel title="Basics" subtitle="Only what helps with safety and coordination">
        <View style={styles.infoCardList}>
          <InfoReadOnlyRow
            label="Location"
            value={profileDraft.city?.trim() ? `${profileDraft.city}${profileDraft.locationCapturedAt ? " (device)" : ""}` : "Location not captured yet"}
            helper="Local discovery uses your device area."
          />
          <Button
            label={isCapturingLocation ? "Capturing..." : "Use Current Location"}
            onPress={() => void handleCaptureLocation()}
            disabled={isCapturingLocation}
          />
          {profileDraft.locationCapturedAt ? (
            <Text style={styles.panelFootnote}>
              Last captured: {new Date(profileDraft.locationCapturedAt).toLocaleString()}
              {typeof profileDraft.locationAccuracyMeters === "number" ? ` • ±${Math.round(profileDraft.locationAccuracyMeters)}m` : ""}
            </Text>
          ) : null}
        </View>

        <View style={styles.quickInfoGrid}>
          <QuickInfo label="First name" value={profileDraft.displayName || "Not set"} />
          <QuickInfo label="Age" value={ageText} />
        </View>
      </Panel>

      <Panel title="Crew Discovery Settings" subtitle="Visibility controls for event-based matching">
        <ToggleRow
          label="Appear in Crew Discovery"
          description="You’ll only appear for events you mark Going + enable Looking for Crew."
          value={profileDraft.communityModeEnabled}
          onPress={handleToggleOpenToCrewMatching}
        />
        <ToggleRow
          label="Community Guidelines Accepted"
          description="Required to appear in crew discovery."
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
                "Review and accept community guidelines in onboarding before turning on crew discovery."
              )
            }
          />
        ) : null}
      </Panel>

      <Panel title="Save & Account" subtitle="Persist core profile fields when signed in">
        {profileSaveStatus === "saving" ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.statusText}>Saving profile...</Text>
          </View>
        ) : null}
        {profileSaveStatus === "saved" ? <Text style={styles.successText}>Profile saved.</Text> : null}
        {profileSaveError ? <Text style={styles.errorText}>{profileSaveError}</Text> : null}
        {crewReadinessLockedReason ? <Text style={styles.panelFootnote}>{crewReadinessLockedReason}</Text> : null}

        <View style={styles.buttonStack}>
          {isModerator ? (
            <Button label="Moderation Queue" variant="secondary" onPress={() => navigation.navigate("ModerationQueue")} />
          ) : null}
          <Button label="Save Profile" onPress={() => void saveProfileDraft()} />
          <Button label="Sign Out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </Panel>
    </ScrollView>
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

function ToggleRow(props: { label: string; description: string; value: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.toggleRow}>
      <View style={styles.toggleTextWrap}>
        <Text style={styles.toggleLabel}>{props.label}</Text>
        <Text style={styles.toggleDescription}>{props.description}</Text>
      </View>
      <View style={[styles.toggleTrack, props.value && styles.toggleTrackOn]}>
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
    gap: 10,
    backgroundColor: "#11100D"
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#100D0A",
    padding: 14,
    gap: 12,
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
    gap: 12,
    alignItems: "stretch"
  },
  heroPassStamp: {
    width: 78,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.26)",
    backgroundColor: "rgba(211,92,51,0.06)",
    padding: 10,
    justifyContent: "space-between",
    overflow: "hidden"
  },
  heroCoverImage: {
    ...StyleSheet.absoluteFillObject
  },
  heroCoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)"
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
    gap: 8
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
    flexDirection: "row",
    gap: 8,
    marginTop: 2
  },
  heroActionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.32)",
    backgroundColor: "#C24A22",
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  heroActionButtonText: {
    color: "#FFF8EE",
    fontWeight: "700",
    fontSize: 13
  },
  heroGhostButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  heroGhostButtonText: {
    color: "#EDE2D2",
    fontWeight: "700",
    fontSize: 13
  },
  heroTitle: {
    color: "#FFF8EE",
    ...theme.type.titleLg,
    fontSize: 18
  },
  heroSubtitle: {
    color: "rgba(255,249,239,0.68)",
    fontSize: 12,
    lineHeight: 17
  },
  progressModule: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    gap: 8
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  progressLabel: {
    color: "rgba(255,249,239,0.68)",
    fontSize: 11,
    fontWeight: "700"
  },
  progressPct: {
    color: "#FFD4C4",
    fontSize: 11,
    fontWeight: "800"
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
  progressTicksRow: {
    flexDirection: "row",
    gap: 6
  },
  progressTick: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  progressTickOn: {
    backgroundColor: "rgba(211,92,51,0.6)"
  },
  heroMetricsRow: {
    flexDirection: "row",
    gap: 8
  },
  miniStat: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    backgroundColor: "#12100C",
    paddingVertical: 9,
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
    gap: 8
  },
  quickInfoTile: {
    width: "48.5%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    gap: 4
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
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "#0F0D0A",
    padding: 14,
    gap: 12,
    overflow: "hidden"
  },
  panelHeader: {
    gap: 4
  },
  panelTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  panelSubtitle: {
    color: "rgba(255,249,239,0.62)",
    fontSize: 12,
    lineHeight: 17
  },
  infoSectionLabel: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  infoCardList: {
    gap: 10
  },
  infoRowCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#14110D",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4
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
    gap: 10
  },
  bioBubbleCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.16)",
    backgroundColor: "#120E0A",
    padding: 12,
    gap: 8
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
    borderColor: "rgba(255,255,255,0.06)",
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
    color: "rgba(255,249,239,0.56)",
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
    gap: 8
  },
  toggleRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#221D16",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  toggleTextWrap: {
    flex: 1,
    gap: 3
  },
  toggleLabel: {
    color: "#FFF8EE",
    fontWeight: "700"
  },
  toggleDescription: {
    color: "rgba(255,249,239,0.6)",
    fontSize: 12
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
