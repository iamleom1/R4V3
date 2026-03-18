import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../../theme";

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  multiline?: boolean;
};

export function InputField(props: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        secureTextEntry={props.secureTextEntry}
        keyboardType={props.keyboardType}
        autoCapitalize={props.keyboardType === "email-address" ? "none" : "sentences"}
        multiline={props.multiline}
        style={[styles.input, props.multiline && styles.multiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: theme.spacing.xs
  },
  label: {
    color: theme.colors.textPrimary,
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceMuted
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: "top"
  }
});
