import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { useAppState } from "../../app/AppProvider";
import { InputField } from "../../components/ui/InputField";
import { trackEvent } from "../../lib/telemetry";
import { getSupabaseClient } from "../../lib/supabase";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";

type AuthRouteParams = {
  intent?: "crew_chat" | "gated_action";
  authPrompt?: string;
};
type AuthStep = "email" | "login_password" | "signup_password";

export function AuthScreen() {
  const { authStatus } = useAppState();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const params = (route?.params ?? {}) as AuthRouteParams;
  const [authStep, setAuthStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabaseEnabled = Boolean(getSupabaseClient());

  const subtext = useMemo(() => {
    if (params.authPrompt?.trim()) {
      return params.authPrompt.trim();
    }
    if (params.intent === "crew_chat") {
      return "Sign in to join this crew chat.";
    }
    return "Sign in to RSVP, find a crew, and unlock event chat.";
  }, [params.authPrompt, params.intent]);

  async function handleEmailContinue() {
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Continue with email needs Supabase auth keys.");
        return;
      }

      const { data, error: existsError } = await supabase.functions.invoke("email-exists", {
        body: { email: trimmedEmail }
      });

      if (existsError) {
        setError(toUserFacingError(existsError, "Couldn’t verify this email right now."));
        void trackEvent("email_continue_failed", { message: existsError.message });
        return;
      }

      if (data?.exists) {
        setPassword("");
        setSignupPasswordConfirm("");
        setAuthStep("login_password");
        void trackEvent("email_continue_requested", { next_step: "login_password" });
        return;
      }

      setPassword("");
      setSignupPasswordConfirm("");
      setAuthStep("signup_password");
      void trackEvent("email_continue_requested", { next_step: "signup_password" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordLogin() {
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail) {
      setAuthStep("email");
      setError("Email is required.");
      return;
    }
    if (!trimmedPassword) {
      setError("Password is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Log in needs Supabase auth keys.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword
      });
      if (signInError) {
        setError(toUserFacingError(signInError, "Couldn’t log in right now."));
        void trackEvent("password_login_failed", { message: signInError.message });
        return;
      }

      void trackEvent("password_login_requested", {});
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignUp() {
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail) {
      setAuthStep("email");
      setError("Email is required.");
      return;
    }
    if (!trimmedPassword) {
      setError("Password is required.");
      return;
    }
    if (trimmedPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (trimmedPassword !== signupPasswordConfirm.trim()) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Sign up needs Supabase auth keys.");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword
      });

      if (signUpError) {
        setError(toUserFacingError(signUpError, "Couldn’t create your account right now."));
        void trackEvent("signup_failed", { message: signUpError.message });
        return;
      }

      if (!data.session) {
        setError("Sign up completed, but no session was created. Disable email confirmation in Supabase Auth to continue directly to onboarding.");
        return;
      }

      void trackEvent("signup_completed", {});
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.bgLayerBase} />
      <View style={styles.bgLayerWarm} />
      <View style={styles.bgLayerPurple} />
      <View style={styles.bgLayerNavy} />
      <View style={styles.bgLayerDark} />

      {navigation.canGoBack?.() ? (
        <Pressable style={styles.modalTopLeftExit} onPress={() => navigation.goBack()}>
          <Text style={styles.modalTopLeftExitText}>‹</Text>
        </Pressable>
      ) : null}

      <View style={styles.centerBrandWrap}>
        <Text style={styles.centerBrandText}>R4V3</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.bottomSheetAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
      >
      <ScrollView
        style={styles.bottomSheet}
        contentContainerStyle={styles.bottomSheetContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.sheetHeader}>
          <View style={styles.chevronSpacer} />
          <View style={styles.brandLockupRow}>
            <Text style={styles.brandText}>R4V3</Text>
            <View style={styles.brandDot} />
          </View>
        </View>

        <View style={styles.headerBlock}>
          <Text style={styles.headerTitle}>Find your crew for events</Text>
          <Text style={styles.headerSubtext}>{subtext}</Text>
          <Text style={styles.supportingCopy}>Use email to join crews, manage your profile, and control visibility from your account screen later.</Text>
          <View style={styles.benefitsWrap}>
            <Chip label="Event-based matching" />
            <Chip label="Crew chats" />
            <Chip label="Safety tools" />
          </View>
        </View>

        <View style={styles.formBlock}>
          {authStep === "email" ? (
            <>
              <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
              <Text style={styles.microcopy}>We&apos;ll create an account if you&apos;re new.</Text>
              <Pressable
                style={[styles.primaryButton, (isSubmitting || authStatus === "loading") && styles.primaryButtonDisabled]}
                onPress={() => void handleEmailContinue()}
                disabled={isSubmitting || authStatus === "loading"}
              >
                <Text style={styles.primaryButtonText}>{isSubmitting ? "Checking..." : "Continue with email"}</Text>
              </Pressable>
            </>
          ) : null}

          {authStep === "login_password" ? (
            <>
              <InputField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
              <Pressable style={styles.linkRow} onPress={() => setAuthStep("email")}>
                <Text style={styles.linkText}>Use a different email</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, (isSubmitting || authStatus === "loading") && styles.primaryButtonDisabled]}
                onPress={() => void handlePasswordLogin()}
                disabled={isSubmitting || authStatus === "loading"}
              >
                <Text style={styles.primaryButtonText}>{isSubmitting ? "Logging in..." : "Log in"}</Text>
              </Pressable>
            </>
          ) : null}

          {authStep === "signup_password" ? (
            <>
              <InputField label="Create password" value={password} onChangeText={setPassword} secureTextEntry />
              <InputField label="Retype password" value={signupPasswordConfirm} onChangeText={setSignupPasswordConfirm} secureTextEntry />
              <Text style={styles.microcopy}>New account detected. Create a password to start onboarding.</Text>
              <Pressable style={styles.linkRow} onPress={() => setAuthStep("email")}>
                <Text style={styles.linkText}>Use a different email</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, (isSubmitting || authStatus === "loading") && styles.primaryButtonDisabled]}
                onPress={() => void handleSignUp()}
                disabled={isSubmitting || authStatus === "loading"}
              >
                <Text style={styles.primaryButtonText}>{isSubmitting ? "Creating..." : "Create account"}</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        {!supabaseEnabled ? <Text style={styles.hint}>Demo mode active until Supabase auth keys are configured.</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.trustLine}>You control visibility, can browse events without matching, and can leave later by signing out or deleting your account.</Text>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Chip(props: { label: string }) {
  return (
    <View style={styles.benefitChip}>
      <Text style={styles.benefitChipText}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#0D0B09",
    overflow: "hidden"
  },
  bgLayerBase: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#0D0B09"
  },
  bgLayerWarm: {
    position: "absolute",
    width: 420,
    height: 210,
    borderRadius: 44,
    top: 44,
    right: -150,
    backgroundColor: "#9E3518",
    opacity: 0.16,
    transform: [{ rotate: "-17deg" }]
  },
  bgLayerPurple: {
    position: "absolute",
    width: 340,
    height: 180,
    borderRadius: 40,
    top: 120,
    left: -140,
    backgroundColor: "#6C49FF",
    opacity: 0.1,
    transform: [{ rotate: "12deg" }]
  },
  bgLayerNavy: {
    position: "absolute",
    width: 420,
    height: 200,
    borderRadius: 44,
    bottom: 250,
    right: -160,
    backgroundColor: "#1A2E58",
    opacity: 0.1,
    transform: [{ rotate: "-10deg" }]
  },
  bgLayerDark: {
    position: "absolute",
    width: 420,
    height: 160,
    borderRadius: 34,
    bottom: 192,
    left: -160,
    backgroundColor: "#4A170E",
    opacity: 0.2,
    transform: [{ rotate: "13deg" }]
  },
  modalTopLeftExit: {
    position: "absolute",
    top: 56,
    left: 18,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.34)"
  },
  modalTopLeftExitText: {
    color: "#FFF8EE",
    fontSize: 24,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: -1
  },
  centerBrandWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40
  },
  centerBrandText: {
    color: "rgba(255,248,238,0.92)",
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: 2.2
  },
  bottomSheetAvoid: {
    width: "100%"
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(15,12,9,0.94)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }
  },
  bottomSheetContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  chevronSpacer: {
    width: 32,
    height: 32
  },
  brandLockupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  brandText: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.1
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E15A2D"
  },
  headerBlock: {
    gap: 6
  },
  headerTitle: {
    color: "#FFF9EF",
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800"
  },
  headerSubtext: {
    color: "rgba(255,249,239,0.74)",
    ...theme.type.body
  },
  supportingCopy: {
    color: "rgba(255,245,236,0.62)",
    ...theme.type.caption
  },
  benefitsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2
  },
  benefitChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  benefitChipText: {
    color: "rgba(255,245,236,0.9)",
    fontSize: 11,
    fontWeight: "700"
  },
  formBlock: {
    gap: 10
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D35C33",
    backgroundColor: "#D65B2C",
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButtonDisabled: {
    opacity: 0.65
  },
  primaryButtonText: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  microcopy: {
    color: "rgba(255,245,236,0.62)",
    ...theme.type.caption
  },
  linkRow: {
    alignSelf: "flex-start"
  },
  linkText: {
    color: "rgba(255,220,202,0.72)",
    ...theme.type.caption,
    fontWeight: "600"
  },
  hint: {
    color: "rgba(255,245,236,0.6)",
    ...theme.type.caption
  },
  message: {
    color: "#B9F0C8",
    fontWeight: "600"
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600"
  },
  trustLine: {
    color: "rgba(255,245,236,0.56)",
    ...theme.type.caption,
    textAlign: "center",
    marginTop: 2
  }
});
