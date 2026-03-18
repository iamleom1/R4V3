import React from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { theme } from "../../theme";

type ButtonVariant = "primary" | "secondary" | "ghost";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, disabled, loading, variant = "primary", style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : theme.colors.textPrimary} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "primary" && styles.primaryLabel,
            variant !== "primary" && styles.secondaryLabel
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent
  },
  secondary: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border
  },
  ghost: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: theme.colors.border
  },
  pressed: {
    opacity: 0.9
  },
  disabled: {
    opacity: 0.55
  },
  label: {
    fontWeight: "700"
  },
  primaryLabel: {
    color: "#fff"
  },
  secondaryLabel: {
    color: theme.colors.textPrimary
  }
});
