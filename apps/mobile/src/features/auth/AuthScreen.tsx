import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { useAppState } from "../../app/AppProvider";
import { InputField } from "../../components/ui/InputField";
import { getSupabaseClient } from "../../lib/supabase";
import { theme } from "../../theme";

type AuthMode = "email" | "magic_link";

type AuthRouteParams = {
  intent?: "crew_chat" | "gated_action";
  authPrompt?: string;
};
type LoginStep = "email" | "password";

export function AuthScreen() {
  const { authStatus } = useAppState();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const params = (route?.params ?? {}) as AuthRouteParams;
  const [mode, setMode] = useState<AuthMode>("email");
  const [loginStep, setLoginStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const stepAnim = useRef(new Animated.Value(0)).current;

  const supabaseEnabled = Boolean(getSupabaseClient());

  const subtext = useMemo(() => {
    if (params.authPrompt?.trim()) {
      return params.authPrompt.trim();
    }
    if (params.intent === "crew_chat") {
      return "Sign in to join this crew chat.";
    }
    return "Sign in to RSVP, match with crews, and join event chats.";
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
      setLoginStep("password");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    Animated.timing(stepAnim, {
      toValue: loginStep === "password" ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [loginStep, stepAnim]);

  async function handlePasswordLogin() {
    setError(null);
    setMessage(null);
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail) {
      setLoginStep("email");
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
        setMessage("Email/password login needs Supabase auth keys.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword
      });
      if (signInError) {
        setError(signInError.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendMagicLink() {
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
        setError("Email Link needs Supabase auth keys.");
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: { shouldCreateUser: true }
      });

      if (otpError) {
        setError(otpError.message);
        return;
      }

      setMessage("Check your email for a secure sign-in link.");
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
          <Text style={styles.headerTitle}>Join the crew.</Text>
          <Text style={styles.headerSubtext}>{subtext}</Text>
          <Text style={styles.supportingCopy}>Continue with email to join crews, RSVP to events, and unlock event chats.</Text>
          <View style={styles.benefitsWrap}>
            <Chip label="Event-based matching" />
            <Chip label="Crew chats" />
            <Chip label="Safety tools" />
          </View>
        </View>

        <View style={styles.tabsRow}>
          <TabButton
            label="Log in"
            active={mode === "email"}
            onPress={() => {
              setMode("email");
            }}
          />
          <TabButton
            label="Email Link"
            active={mode === "magic_link"}
            onPress={() => {
              setMode("magic_link");
              setLoginStep("email");
              setPassword("");
            }}
          />
        </View>

        {mode === "email" ? (
          <View style={styles.formBlock}>
            {loginStep === "password" ? (
              <Animated.View
                style={[
                  styles.stepWrap,
                  {
                    opacity: stepAnim,
                    transform: [
                      {
                        translateX: stepAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [18, 0]
                        })
                      }
                    ]
                  }
                ]}
              >
                <InputField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
                <Pressable style={styles.linkRow} onPress={() => setLoginStep("email")}>
                  <Text style={styles.linkText}>Use a different email</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, (isSubmitting || authStatus === "loading") && styles.primaryButtonDisabled]}
                  onPress={() => void handlePasswordLogin()}
                  disabled={isSubmitting || authStatus === "loading"}
                >
                  <Text style={styles.primaryButtonText}>{isSubmitting ? "Logging in..." : "Log in"}</Text>
                </Pressable>
              </Animated.View>
            ) : (
              <Animated.View
                style={[
                  styles.stepWrap,
                  {
                    opacity: stepAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0]
                    }),
                    transform: [
                      {
                        translateX: stepAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -18]
                        })
                      }
                    ]
                  }
                ]}
              >
                <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
                <Text style={styles.microcopy}>Continue with your email and then enter your password to log in.</Text>
                <Pressable
                  style={[styles.primaryButton, (isSubmitting || authStatus === "loading") && styles.primaryButtonDisabled]}
                  onPress={() => void handleEmailContinue()}
                  disabled={isSubmitting || authStatus === "loading"}
                >
                  <Text style={styles.primaryButtonText}>{isSubmitting ? "Loading..." : "Continue"}</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        ) : (
          <View style={styles.formBlock}>
            <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Text style={styles.microcopy}>We&apos;ll send a secure sign-in link to your email. No password required.</Text>
            <Pressable
              style={[styles.primaryButton, (isSubmitting || authStatus === "loading") && styles.primaryButtonDisabled]}
              onPress={() => void handleSendMagicLink()}
              disabled={isSubmitting || authStatus === "loading"}
            >
              <Text style={styles.primaryButtonText}>{isSubmitting ? "Sending..." : "Send link"}</Text>
            </Pressable>
          </View>
        )}

        {!supabaseEnabled ? <Text style={styles.hint}>Demo mode active until Supabase auth keys are configured.</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.trustLine}>You control your visibility. You can browse events without matching.</Text>
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

function TabButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tabButton, props.active && styles.tabButtonActive]} onPress={props.onPress}>
      <Text style={[styles.tabButtonText, props.active && styles.tabButtonTextActive]}>{props.label}</Text>
    </Pressable>
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
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 10,
    alignItems: "center"
  },
  tabButtonActive: {
    borderColor: "rgba(211,92,51,0.58)",
    backgroundColor: "rgba(211,92,51,0.2)"
  },
  tabButtonText: {
    color: "rgba(255,248,241,0.72)",
    fontSize: 12,
    fontWeight: "700"
  },
  tabButtonTextActive: {
    color: "#FFF8EE"
  },
  formBlock: {
    gap: 10
  },
  stepWrap: {
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
