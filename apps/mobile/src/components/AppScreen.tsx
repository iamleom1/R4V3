import React, { PropsWithChildren } from "react";
import { View, StyleSheet } from "react-native";
import { theme } from "../theme";

export function AppScreen({ children }: PropsWithChildren) {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  }
});
