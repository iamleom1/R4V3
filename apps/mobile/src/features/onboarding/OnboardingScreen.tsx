import React, { useMemo, useState } from "react";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAppState } from "../../app/AppProvider";
import { SectionCard } from "../../components/SectionCard";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { InputField } from "../../components/ui/InputField";
import { theme } from "../../theme";
import { captureCurrentDeviceLocation } from "../profile/deviceLocationService";
import { validateProfileDraft } from "../profile/profileDraftService";

const vibeOptions = ["Solo-friendly", "Small crew", "Open crew", "Stick together", "Chill meetup", "High energy", "Afters", "Pregame", "Sober-friendly"];
const genreOptions = ["House", "Tech House", "Techno", "Melodic Techno", "Dubstep", "Drum & Bass", "Progressive"];
const genderOptions = ["Woman", "Man", "Non-binary", "Trans woman", "Trans man", "Genderfluid"];
const matchGenderOptions = ["Woman", "Man", "Non-binary", "Everyone"] as const;
const MIN_AGE = 18;
const MAX_AGE = 50;

export function OnboardingScreen() {
  const { profileDraft, updateProfileDraft, completeOnboarding, profileSaveError, profileSaveStatus, signOut } = useAppState();
  const [step, setStep] = useState(0);
  const [showBirthdatePicker, setShowBirthdatePicker] = useState(false);
  const [isGenderModalOpen, setIsGenderModalOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const steps = ["Identity", "Vibe + Music", "Who you want to meet", "Safety & Crew Matching"];
  const validation = validateProfileDraft({ ...profileDraft, onboardingCompleted: true });
  const selectedBirthdate = useMemo(() => parseBirthdate(profileDraft.birthdate), [profileDraft.birthdate]);

  const canAdvance = useMemo(() => {
    if (step === 0) {
      return Boolean(profileDraft.displayName.trim() && profileDraft.birthdate.trim() && profileDraft.gender.trim() && profileDraft.city.trim());
    }
    if (step === 1) {
      return profileDraft.vibeTags.length >= 1 && profileDraft.musicGenres.length >= 1;
    }
    if (step === 2) {
      return true;
    }
    return profileDraft.guidelinesAccepted;
  }, [profileDraft, step]);

  function toggleFromList(key: "vibeTags" | "musicGenres", value: string) {
    const list = profileDraft[key];
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    updateProfileDraft({ [key]: next } as Pick<typeof profileDraft, typeof key>);
  }

  async function handleNext() {
    if (step < steps.length - 1) {
      setStep((prev) => prev + 1);
      return;
    }
    const ok = await completeOnboarding();
    if (!ok) {
      setStep(3);
    }
  }

  function handleBirthdateChange(_event: DateTimePickerEvent, nextDate?: Date) {
    if (Platform.OS !== "ios") {
      setShowBirthdatePicker(false);
    }
    if (!nextDate) {
      return;
    }
    updateProfileDraft({ birthdate: formatBirthdateValue(nextDate) });
  }

  async function handleUseCurrentLocation() {
    setLocationError(null);
    setIsLocating(true);
    try {
      const result = await captureCurrentDeviceLocation();
      if (!result.ok) {
        setLocationError(result.error);
        if (result.error.toLowerCase().includes("permission")) {
          Alert.alert(
            "Location permission needed",
            "Turn on location access to use your current city for onboarding.",
            [
              { text: "Not now", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  void Linking.openSettings();
                }
              }
            ]
          );
        }
        return;
      }

      updateProfileDraft({
        city: result.location.city ?? profileDraft.city,
        locationLat: result.location.latitude,
        locationLng: result.location.longitude,
        locationAccuracyMeters: result.location.accuracyMeters,
        locationCapturedAt: result.location.capturedAt
      });

      if (!result.location.city) {
        setLocationError("Location captured, but we could not resolve a city.");
      }
    } finally {
      setIsLocating(false);
    }
  }

  const selectedMatchGender = useMemo(() => {
    if (profileDraft.interestedGenders.length === 0) {
      return "Everyone";
    }
    if (profileDraft.interestedGenders.length === 1 && matchGenderOptions.includes(profileDraft.interestedGenders[0] as any)) {
      return profileDraft.interestedGenders[0];
    }
    return profileDraft.interestedGenders[0] ?? "Everyone";
  }, [profileDraft.interestedGenders]);

  function handleSelectInterestedGender(value: (typeof matchGenderOptions)[number]) {
    if (value === "Everyone") {
      updateProfileDraft({ interestedGenders: [] });
      return;
    }
    updateProfileDraft({ interestedGenders: [value] });
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Onboarding</Text>
        <Text style={styles.heroTitle}>Build your profile with intent</Text>
        <Text style={styles.copy}>
          Community-first setup with clear consent before crew matching.
        </Text>
      </View>
      <SectionCard title="Onboarding" subtitle={`Step ${step + 1} of ${steps.length}: ${steps[step]}`}>
        <View style={styles.progressTrack}>
          {steps.map((_, index) => (
            <View key={index} style={[styles.progressBar, index <= step && styles.progressBarActive]} />
          ))}
        </View>
      </SectionCard>

      {step === 0 ? (
        <SectionCard title="Identity First">
          <LabeledInput
            label="Display Name"
            value={profileDraft.displayName}
            onChangeText={(displayName) => updateProfileDraft({ displayName })}
            placeholder="How people will know you"
          />
          <PickerField
            label="Birthdate"
            value={profileDraft.birthdate ? formatBirthdateLabel(selectedBirthdate) : ""}
            placeholder="Select your birthdate"
            onPress={() => setShowBirthdatePicker((current) => !current)}
          />
          {showBirthdatePicker ? (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={selectedBirthdate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={getAdultMaximumDate()}
                onChange={handleBirthdateChange}
              />
              {Platform.OS === "ios" ? (
                <Pressable style={styles.inlineActionButton} onPress={() => setShowBirthdatePicker(false)}>
                  <Text style={styles.inlineActionButtonText}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <PickerField
            label="Gender"
            value={profileDraft.gender}
            placeholder="Select your gender"
            onPress={() => setIsGenderModalOpen(true)}
          />
          <LocationField
            city={profileDraft.city}
            isLocating={isLocating}
            onPress={() => void handleUseCurrentLocation()}
          />
          {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
          <LabeledInput
            label="Bio"
            value={profileDraft.bio}
            onChangeText={(bio) => updateProfileDraft({ bio })}
            placeholder="Your vibe, live-music habits, boundaries, and what you're looking for"
            multiline
          />
        </SectionCard>
      ) : null}

      {step === 1 ? (
        <>
          <SectionCard title="Vibe Tags" subtitle="Pick 1-2">
            <ChipGrid
              options={vibeOptions}
              selected={profileDraft.vibeTags}
              onToggle={(value) => toggleFromList("vibeTags", value)}
            />
            <Text style={styles.helperText}>Pick 1-2 that match how you actually move through a night out.</Text>
          </SectionCard>
          <SectionCard title="Music Preferences" subtitle="Pick 1-2">
            <ChipGrid
              options={genreOptions}
              selected={profileDraft.musicGenres}
              onToggle={(value) => toggleFromList("musicGenres", value)}
            />
            <Text style={styles.helperText}>Pick 1-2 genres so discovery has a useful signal.</Text>
          </SectionCard>
        </>
      ) : null}

      {step === 2 ? (
        <SectionCard title="Who you want to meet" subtitle="Set your discovery preferences">
          <Text style={styles.fieldLabel}>Interested in</Text>
          <ChipGrid
            options={[...matchGenderOptions]}
            selected={[selectedMatchGender]}
            onToggle={(value) => handleSelectInterestedGender(value as (typeof matchGenderOptions)[number])}
            singleSelect
          />
          <View style={styles.rangeHeader}>
            <Text style={styles.fieldLabel}>Age range</Text>
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
        </SectionCard>
      ) : null}

      {step === 3 ? (
        <SectionCard title="Safety, Consent, and Crew Matching">
          <Text style={styles.copy}>
            Turn on crew matching only when you want to be discoverable for event-based crew connections.
          </Text>

          <ToggleRow
            label="Open to Crew Matching"
            description="Appear in crew discovery when your profile is ready"
            value={profileDraft.communityModeEnabled}
            onPress={() =>
              updateProfileDraft({
                communityModeEnabled: !profileDraft.communityModeEnabled,
                datingModeEnabled: false
              })
            }
          />

          <ToggleRow
            label="I accept the community guidelines and 18+ requirement"
            description="Required to continue"
            value={profileDraft.guidelinesAccepted}
            onPress={() => updateProfileDraft({ guidelinesAccepted: !profileDraft.guidelinesAccepted })}
          />

          {!validation.isValid ? (
            <View style={styles.warningBox}>
              {validation.errors.map((error) => (
                <Text key={error} style={styles.warningText}>
                  • {error}
                </Text>
              ))}
            </View>
          ) : null}

          {profileSaveError ? <Text style={styles.errorText}>{profileSaveError}</Text> : null}
        </SectionCard>
      ) : null}

      <View style={styles.footer}>
        {step > 0 ? (
          <Button label="Back" variant="ghost" onPress={() => setStep((prev) => prev - 1)} style={styles.footerButton} />
        ) : (
          <Button label="Back" variant="ghost" onPress={() => void signOut()} style={styles.footerButton} />
        )}
        <Button
          label={step === steps.length - 1 ? "Finish" : "Next"}
          onPress={() => void handleNext()}
          disabled={!canAdvance}
          loading={profileSaveStatus === "saving" && step === steps.length - 1}
          style={styles.footerButton}
        />
      </View>
    </ScrollView>
    <OptionPickerModal
      visible={isGenderModalOpen}
      title="Select gender"
      options={genderOptions}
      selectedValue={profileDraft.gender}
      onClose={() => setIsGenderModalOpen(false)}
      onSelect={(value) => updateProfileDraft({ gender: value })}
    />
    </KeyboardAvoidingView>
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return <InputField {...props} />;
}

function PickerField(props: { label: string; value: string; placeholder: string; onPress: () => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <Pressable onPress={props.onPress} style={styles.selectorField}>
        <Text style={props.value ? styles.selectorValue : styles.selectorPlaceholder}>
          {props.value || props.placeholder}
        </Text>
      </Pressable>
    </View>
  );
}

function LocationField(props: { city: string; isLocating: boolean; onPress: () => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>City</Text>
      <Pressable onPress={props.onPress} style={styles.selectorField} disabled={props.isLocating}>
        <View style={styles.locationRow}>
          <Text style={props.city ? styles.selectorValue : styles.selectorPlaceholder}>
            {props.city || "Use current location"}
          </Text>
          {props.isLocating ? <ActivityIndicator size="small" color={theme.colors.accent} /> : null}
        </View>
      </Pressable>
    </View>
  );
}

function ChipGrid(props: { options: string[]; selected: string[]; onToggle: (value: string) => void; singleSelect?: boolean }) {
  return (
    <View style={styles.chipGrid}>
      {props.options.map((option) => {
        const selected = props.selected.includes(option);
        return (
          <Chip key={option} label={option} selected={selected} onPress={() => props.onToggle(option)} />
        );
      })}
    </View>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={props.onPress} style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleLabel}>{props.label}</Text>
        <Text style={styles.toggleDescription}>{props.description}</Text>
      </View>
      <View style={[styles.togglePill, props.value && styles.togglePillOn]}>
        <View style={[styles.toggleKnob, props.value && styles.toggleKnobOn]} />
      </View>
    </Pressable>
  );
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  },
  container: {
    padding: 16,
    gap: 14,
    paddingBottom: 24,
    backgroundColor: theme.colors.canvas
  },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 6
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
  progressTrack: {
    flexDirection: "row",
    gap: 8
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted
  },
  progressBarActive: {
    backgroundColor: theme.colors.accent
  },
  copy: {
    color: theme.colors.textSecondary,
    ...theme.type.body
  },
  field: {
    gap: theme.spacing.xs
  },
  fieldLabel: {
    color: theme.colors.textPrimary,
    fontWeight: "600"
  },
  selectorField: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: theme.colors.surfaceMuted
  },
  selectorValue: {
    color: theme.colors.textPrimary
  },
  selectorPlaceholder: {
    color: theme.colors.textSecondary
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: "hidden"
  },
  inlineActionButton: {
    alignSelf: "flex-end",
    marginRight: 12,
    marginBottom: 12
  },
  inlineActionButtonText: {
    color: theme.colors.accent,
    fontWeight: "700"
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  warningBox: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(216,155,34,0.55)",
    backgroundColor: "rgba(216,155,34,0.12)",
    padding: 10,
    gap: 4
  },
  warningText: {
    color: "#FFD27D",
    fontSize: 12,
    lineHeight: 16
  },
  errorText: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17
  },
  agePrefBlock: {
    gap: 10
  },
  agePrefLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.2
  },
  rangeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  rangeValue: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700"
  },
  sliderBlock: {
    gap: 8,
    paddingVertical: 4
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
  toggleRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: theme.colors.surfaceMuted
  },
  toggleCopy: {
    flex: 1,
    gap: 4
  },
  toggleLabel: {
    color: theme.colors.textPrimary,
    fontWeight: "600"
  },
  toggleDescription: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16
  },
  togglePill: {
    width: 46,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#6F6457",
    padding: 3,
    justifyContent: "center"
  },
  togglePillOn: {
    backgroundColor: theme.colors.accent
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#FFF2E2"
  },
  toggleKnobOn: {
    alignSelf: "flex-end"
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 10
  },
  footerButton: {
    flex: 1
  },
  disabledButton: {
    opacity: 0.45
  }
});

function parseBirthdate(value: string) {
  if (!value) {
    return getAdultMaximumDate();
  }
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? getAdultMaximumDate() : parsed;
}

function formatBirthdateValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBirthdateLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function getAdultMaximumDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date;
}

function formatPreferenceAge(value: number) {
  return value >= MAX_AGE ? `${MAX_AGE}+` : String(value);
}
