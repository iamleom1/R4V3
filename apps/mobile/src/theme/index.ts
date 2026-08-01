export const theme = {
  colors: {
    canvas: "#000000",
    surface: "#0A0A0A",
    surfaceMuted: "#121212",
    border: "#242424",
    textPrimary: "#FFF8EE",
    textSecondary: "#B8AA96",
    accent: "#D35C33",
    accentSoft: "#1A0F0B"
  },
  radii: {
    sm: 10,
    md: 14,
    lg: 20,
    pill: 999
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 16
  },
  type: {
    eyebrow: {
      fontSize: 11,
      fontWeight: "700" as const,
      letterSpacing: 0.6
    },
    titleLg: {
      fontSize: 22,
      fontWeight: "700" as const
    },
    titleMd: {
      fontSize: 18,
      fontWeight: "700" as const
    },
    titleSm: {
      fontSize: 16,
      fontWeight: "700" as const
    },
    body: {
      fontSize: 14,
      lineHeight: 20
    },
    caption: {
      fontSize: 12,
      lineHeight: 16
    }
  }
} as const;
