import React, { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useAppState } from "../../app/AppProvider";
import { SectionCard } from "../../components/SectionCard";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { InputField } from "../../components/ui/InputField";
import { theme } from "../../theme";
import { validateProfileDraft } from "../profile/profileDraftService";

const vibeOptions = ["House", "Techno", "Bass", "Festival Crew", "Sober-Friendly", "Afters", "Trance"];
const genreOptions = ["EDM", "Tech House", "Dubstep", "Melodic Techno", "Drum & Bass", "Progressive"];

export function OnboardingScreen() {
  const { profileDraft, updateProfileDraft, completeOnboarding, profileSaveError, profileSaveStatus, signOut } = useAppState();
  const [step, setStep] = useState(0);
  const steps = ["Identity", "Preferences", "Safety & Crew Matching"];
  const validation = validateProfileDraft({ ...profileDraft, onboardingCompleted: true });

  const canAdvance = useMemo(() => {
    if (step === 0) {
      return Boolean(profileDraft.displayName.trim() && profileDraft.birthdate.trim() && profileDraft.city.trim());
    }
    if (step === 1) {
      return profileDraft.vibeTags.length > 0 && profileDraft.musicGenres.length > 0;
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
      setStep(2);
    }
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
          <LabeledInput
            label="Birthdate (YYYY-MM-DD)"
            value={profileDraft.birthdate}
            onChangeText={(birthdate) => updateProfileDraft({ birthdate })}
            placeholder="18+ only"
          />
          <LabeledInput
            label="City"
            value={profileDraft.city}
            onChangeText={(city) => updateProfileDraft({ city })}
            placeholder="Los Angeles"
          />
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
          <SectionCard title="Vibe Tags" subtitle="Choose tags that reflect your social style">
            <ChipGrid
              options={vibeOptions}
              selected={profileDraft.vibeTags}
              onToggle={(value) => toggleFromList("vibeTags", value)}
            />
          </SectionCard>
          <SectionCard title="Music Preferences" subtitle="These will help rank event and profile relevance">
            <ChipGrid
              options={genreOptions}
              selected={profileDraft.musicGenres}
              onToggle={(value) => toggleFromList("musicGenres", value)}
            />
          </SectionCard>
        </>
      ) : null}

      {step === 2 ? (
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

function ChipGrid(props: { options: string[]; selected: string[]; onToggle: (value: string) => void }) {
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
