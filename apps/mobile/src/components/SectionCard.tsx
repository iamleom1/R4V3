import React, { PropsWithChildren } from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export function SectionCard({ title, subtitle, children }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }
  },
  header: {
    gap: 4
  },
  title: {
    color: theme.colors.textPrimary,
    ...theme.type.titleMd
  },
  subtitle: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  content: {
    gap: 10
  }
});
