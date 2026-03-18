import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "../../theme";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  selected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft
  },
  text: {
    color: theme.colors.textPrimary,
    ...theme.type.caption,
    fontWeight: "700"
  },
  textSelected: {
    color: theme.colors.textPrimary
  }
});
