import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { useAppState } from "../../app/AppProvider";
import { trackEvent } from "../../lib/telemetry";
import { getSupabaseClient } from "../../lib/supabase";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { theme } from "../../theme";
import { signInWithApple } from "./socialAuth";

type AuthRouteParams = {
  intent?: "crew_chat" | "gated_action";
  authPrompt?: string;
};

type AuthStep = "email" | "login_password" | "signup_password";

const TERMS_URL = "https://iamleom1.github.io/terms.html";
const PRIVACY_URL = "https://iamleom1.github.io/privacy.html";

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
  const [isSocialSubmitting, setIsSocialSubmitting] = useState<"apple" | null>(null);

  const supabaseEnabled = Boolean(getSupabaseClient());

  const subtext = useMemo(() => {
    if (params.authPrompt?.trim()) {
      return params.authPrompt.trim();
    }
    if (params.intent === "crew_chat") {
      return "Sign in to join this crew chat.";
    }
    return "Connect with people attending the same events.";
  }, [params.authPrompt, params.intent]);

  async function handleAppleLogin() {
    setError(null);
    setMessage(null);
    setIsSocialSubmitting("apple");

    try {
      const result = await signInWithApple();
      if (!result.ok) {
        setError(toUserFacingError(result.error, "Couldn’t sign in with Apple right now."));
        void trackEvent("apple_login_failed", { message: result.error });
        return;
      }
      void trackEvent("apple_login_requested", {});
    } catch (e) {
      setError(toUserFacingError(e, "Couldn’t sign in with Apple right now."));
      void trackEvent("apple_login_failed", { message: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSocialSubmitting(null);
    }
  }

  function renderSocialActions() {
    if (authStep !== "email" || !supabaseEnabled) {
      return null;
    }

    return (
      <View style={styles.socialBlock}>
        {Platform.OS === "ios" ? (
          <Pressable
            style={[styles.socialButton, styles.appleButton, isSocialSubmitting && styles.socialButtonDisabled]}
            onPress={() => void handleAppleLogin()}
            disabled={Boolean(isSocialSubmitting) || isSubmitting || authStatus === "loading"}
          >
            <Text style={styles.appleButtonLogo}></Text>
            <Text style={styles.appleButtonText}>
              {isSocialSubmitting === "apple" ? "Continue with Apple..." : "Continue with Apple"}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.socialDividerRow}>
          <View style={styles.socialDividerLine} />
          <Text style={styles.socialDividerText}>or use email</Text>
          <View style={styles.socialDividerLine} />
        </View>
      </View>
    );
  }

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

  function openExternalUrl(url: string) {
    void Linking.openURL(url);
  }

  function renderPrimaryForm() {
    if (authStep === "email") {
      return (
        <>
          <View style={styles.emailFieldShell}>
            <View style={styles.emailGlyphBox}>
              <Text style={styles.emailGlyph}>✉</Text>
            </View>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor="rgba(255,255,255,0.38)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.emailInput}
            />
          </View>
          {error ? <Text style={styles.inlineError}>{error}</Text> : null}

          <Pressable
            style={[styles.heroButton, (isSubmitting || authStatus === "loading") && styles.heroButtonDisabled]}
            onPress={() => void handleEmailContinue()}
            disabled={isSubmitting || authStatus === "loading"}
          >
            <Text style={styles.heroButtonText}>{isSubmitting ? "CHECKING" : "CONTINUE"}</Text>
            <Text style={styles.heroButtonArrow}>→</Text>
          </Pressable>
          <Text style={styles.legalCopy}>
            By continuing, you agree to our{" "}
            <Text style={styles.legalLink} onPress={() => openExternalUrl(TERMS_URL)}>
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text style={styles.legalLink} onPress={() => openExternalUrl(PRIVACY_URL)}>
              Privacy Policy
            </Text>.
          </Text>
          <Text style={styles.magicLinkNote}>We&apos;ll check if you already have an account.</Text>
        </>
      );
    }

    if (authStep === "login_password") {
      return (
        <View style={styles.passwordFlowWrap}>
          <Text style={styles.passwordFlowTitle}>Welcome back</Text>
          <Text style={styles.passwordFlowSubtitle}>{email.trim()}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor="rgba(255,255,255,0.38)"
            secureTextEntry
            style={styles.passwordInput}
          />
          <Pressable
            style={[styles.heroButton, (isSubmitting || authStatus === "loading") && styles.heroButtonDisabled]}
            onPress={() => void handlePasswordLogin()}
            disabled={isSubmitting || authStatus === "loading"}
          >
            <Text style={styles.heroButtonText}>{isSubmitting ? "LOGGING IN" : "LOG IN"}</Text>
            <Text style={styles.heroButtonArrow}>→</Text>
          </Pressable>
          <Text style={styles.legalCopy}>
            By continuing, you agree to our{" "}
            <Text style={styles.legalLink} onPress={() => openExternalUrl(TERMS_URL)}>
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text style={styles.legalLink} onPress={() => openExternalUrl(PRIVACY_URL)}>
              Privacy Policy
            </Text>.
          </Text>
          <Pressable style={styles.inlineBackLink} onPress={() => setAuthStep("email")}>
            <Text style={styles.inlineBackLinkText}>Use a different email</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.passwordFlowWrap}>
        <Text style={styles.passwordFlowTitle}>Create your account</Text>
        <Text style={styles.passwordFlowSubtitle}>{email.trim()}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Create password"
          placeholderTextColor="rgba(255,255,255,0.38)"
          secureTextEntry
          style={styles.passwordInput}
        />
        <TextInput
          value={signupPasswordConfirm}
          onChangeText={setSignupPasswordConfirm}
          placeholder="Retype password"
          placeholderTextColor="rgba(255,255,255,0.38)"
          secureTextEntry
          style={styles.passwordInput}
        />
        <Text style={styles.passwordHint}>New account detected. Create a password to start onboarding.</Text>
        <Pressable
          style={[styles.heroButton, (isSubmitting || authStatus === "loading") && styles.heroButtonDisabled]}
          onPress={() => void handleSignUp()}
          disabled={isSubmitting || authStatus === "loading"}
        >
          <Text style={styles.heroButtonText}>{isSubmitting ? "CREATING" : "CREATE ACCOUNT"}</Text>
          <Text style={styles.heroButtonArrow}>→</Text>
        </Pressable>
        <Text style={styles.legalCopy}>
          By continuing, you agree to our{" "}
          <Text style={styles.legalLink} onPress={() => openExternalUrl(TERMS_URL)}>
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text style={styles.legalLink} onPress={() => openExternalUrl(PRIVACY_URL)}>
            Privacy Policy
          </Text>.
        </Text>
        <Pressable style={styles.inlineBackLink} onPress={() => setAuthStep("email")}>
          <Text style={styles.inlineBackLinkText}>Use a different email</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.backgroundBase} />
      <View style={styles.backgroundNoise} />
      <View style={styles.backgroundBlobLeft} />
      <View style={styles.backgroundBlobRight} />
      <View style={styles.backgroundVignette} />

      {navigation.canGoBack?.() ? (
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 14 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
          bounces={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View style={styles.heroBlock}>
            <View style={styles.logoWrap}>
              <Text style={styles.logoText}>R4V3</Text>
              <View style={styles.logoDot} />
            </View>

            <Text style={styles.headline}>
              Find your crew{"\n"}
              <Text style={styles.headlineAccent}>before</Text> the first drop.
            </Text>

            <Text style={styles.subtext}>{subtext}</Text>
          </View>

          <View style={styles.formCard}>
            {renderSocialActions()}
            {renderPrimaryForm()}

            {!supabaseEnabled ? <Text style={styles.helperText}>Demo mode active until Supabase auth keys are configured.</Text> : null}
            {message ? <Text style={styles.message}>{message}</Text> : null}
            {authStep !== "email" && error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#040405",
    overflow: "hidden"
  },
  flex: {
    flex: 1
  },
  backgroundBase: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#040405"
  },
  backgroundNoise: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(255,255,255,0.01)"
  },
  backgroundBlobLeft: {
    position: "absolute",
    width: 288,
    height: 144,
    borderRadius: 44,
    left: -132,
    top: 166,
    backgroundColor: "#36205F",
    opacity: 0.17,
    transform: [{ rotate: "14deg" }]
  },
  backgroundBlobRight: {
    position: "absolute",
    width: 296,
    height: 154,
    borderRadius: 46,
    right: -128,
    top: 176,
    backgroundColor: "#B44D15",
    opacity: 0.27,
    transform: [{ rotate: "-26deg" }]
  },
  backgroundVignette: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.38)"
  },
  backButton: {
    position: "absolute",
    top: 56,
    left: 18,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.26)"
  },
  backButtonText: {
    color: "#FFF8EE",
    fontSize: 24,
    lineHeight: 24,
    fontWeight: "700"
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 28
  },
  heroBlock: {
    alignItems: "center",
    gap: 18
  },
  logoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  logoText: {
    color: "#FFF9F1",
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: 1.1
  },
  logoDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: "#FF6A2A",
    marginTop: 5
  },
  headline: {
    color: "#FFF9F1",
    fontSize: 31,
    lineHeight: 35,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -1,
    maxWidth: "82%",
    alignSelf: "center"
  },
  headlineAccent: {
    color: "#FF6A2A"
  },
  subtext: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: "84%"
  },
  formCard: {
    marginTop: 26,
    gap: 14
  },
  socialBlock: {
    gap: 12,
    marginBottom: 4
  },
  socialButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16
  },
  socialButtonDisabled: {
    opacity: 0.72
  },
  appleButton: {
    backgroundColor: "#0D0D10",
    borderColor: "rgba(255,255,255,0.16)"
  },
  appleButtonLogo: {
    color: "#FFF9F1",
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700"
  },
  appleButtonText: {
    color: "#FFF9F1",
    fontSize: 15,
    fontWeight: "800"
  },
  socialDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2
  },
  socialDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)"
  },
  socialDividerText: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  emailFieldShell: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(26,26,30,0.92)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14
  },
  emailGlyphBox: {
    width: 34,
    alignItems: "center",
    justifyContent: "center"
  },
  emailGlyph: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 18
  },
  emailInput: {
    flex: 1,
    color: "#FFF9F1",
    fontSize: 15,
    paddingVertical: 14
  },
  heroButton: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: "#FF6A2A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: "#FF6A2A",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 }
  },
  heroButtonDisabled: {
    opacity: 0.7
  },
  heroButtonText: {
    color: "#110804",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3
  },
  heroButtonArrow: {
    color: "#110804",
    fontSize: 26,
    lineHeight: 26,
    fontWeight: "500",
    marginTop: -2
  },
  magicLinkNote: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 2
  },
  inlineError: {
    color: "#FF9F9F",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: -4,
    marginBottom: 2,
    paddingHorizontal: 4
  },
  passwordFlowWrap: {
    gap: 14
  },
  passwordFlowTitle: {
    color: "#FFF9F1",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center"
  },
  passwordFlowSubtitle: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
    textAlign: "center"
  },
  passwordInput: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18,18,20,0.84)",
    color: "#FFF9F1",
    fontSize: 15,
    paddingHorizontal: 16
  },
  passwordHint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  inlineBackLink: {
    alignSelf: "center",
    paddingTop: 6
  },
  inlineBackLinkText: {
    color: "rgba(255,210,190,0.82)",
    fontSize: 14,
    fontWeight: "600"
  },
  helperText: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 13,
    textAlign: "center"
  },
  message: {
    color: "#B9F0C8",
    fontWeight: "600",
    textAlign: "center"
  },
  error: {
    color: "#FF9F9F",
    fontWeight: "600",
    textAlign: "center"
  },
  legalCopy: {
    marginTop: 30,
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center"
  },
  legalLink: {
    color: "rgba(255,106,42,0.78)"
  }
});
