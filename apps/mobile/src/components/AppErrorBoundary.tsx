import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { recordError } from "../lib/telemetry";
import { theme } from "../theme";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    void recordError(
      error,
      {
        source: "react_error_boundary",
        componentStack: errorInfo.componentStack ?? null
      },
      true
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>R4V3</Text>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.copy}>
            The app hit an unexpected error. You can try again without losing your account.
          </Text>
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12
  },
  eyebrow: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: "800"
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  button: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  buttonText: {
    color: "#130C1A",
    fontWeight: "800",
    fontSize: 14
  }
});
