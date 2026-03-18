import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppState } from "../../app/AppProvider";
import { theme } from "../../theme";
import type { DiscoverStackParamList } from "./DiscoverNavigator";

type Props = NativeStackScreenProps<DiscoverStackParamList, "RaveRadio">;
type RadioTab = "crew" | "event" | "discover";

type RadioCard = {
  id: string;
  title: string;
  subtitle: string;
  stamp: string;
  accent: "ember" | "violet" | "blue" | "gold";
};

export function RaveRadioScreen({ route }: Props) {
  const { profileDraft } = useAppState();
  const [tab, setTab] = useState<RadioTab>("crew");
  const profileGenres = profileDraft.musicGenres.filter((g) => g.trim());
  const eventGenres = route.params.eventGenres.filter((g) => g.trim());

  const tasteCore = useMemo(() => {
    const merged = [...profileGenres, ...eventGenres];
    const seen = new Set<string>();
    return merged.filter((g) => {
      const key = g.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [eventGenres, profileGenres]);

  const heroNowPlaying = useMemo(() => {
    const first = tasteCore[0] ?? "House";
    return {
      title: "Playlists, Event Music + Live Radio",
      subtitle: "Friends Playlists • Event Sound • Genre Radio",
      stamp: `${first.toUpperCase()} RADIO`
    };
  }, [tasteCore]);

  const cards = useMemo(() => buildTabCards(tab, tasteCore, eventGenres), [tab, tasteCore, eventGenres]);
  const tabMeta = useMemo(() => {
    if (tab === "crew") {
      return {
        title: "Playlists made by friends",
        helper: "Shared playlists from your circle",
        stamp: "FRIEND PLAYLISTS"
      };
    }
    if (tab === "event") {
      return {
        title: "Event-based music discovery",
        helper: "Music related to upcoming events and DJs",
        stamp: "EVENT MUSIC"
      };
    }
    return {
      title: "Overall music discovery",
        helper: "Always-on genre radio for discovery",
        stamp: "GENRE RADIO"
    };
  }, [tab]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroGrid} />
        <View style={styles.heroArcA} />
        <View style={styles.heroArcB} />
        <View style={styles.heroGlow} />
        <View style={styles.heroStamp}>
          <Text style={styles.heroStampText}>{heroNowPlaying.stamp}</Text>
        </View>

        <Text style={styles.eyebrow}>R4V3 RADIO</Text>
        <Text style={styles.heroTitle}>{heroNowPlaying.title}</Text>
        <Text style={styles.heroSubtitle}>{heroNowPlaying.subtitle}</Text>
        <View style={styles.heroVisualStrip}>
          <View style={styles.heroRouteNodeA} />
          <View style={styles.heroRouteNodeB} />
          <View style={styles.heroRouteNodeC} />
          <View style={styles.heroRouteLineA} />
          <View style={styles.heroRouteLineB} />
          <View style={styles.heroRouteLineC} />
        </View>

        <View style={styles.tabRow}>
          <RadioTabChip label="Friends Playlists" active={tab === "crew"} onPress={() => setTab("crew")} />
          <RadioTabChip label="Event Music" active={tab === "event"} onPress={() => setTab("event")} />
          <RadioTabChip label="Genre Radio" active={tab === "discover"} onPress={() => setTab("discover")} />
        </View>
      </View>

      <View style={styles.focusCard}>
        <View style={styles.focusCardHeader}>
          <Text style={styles.focusCardStamp}>{tabMeta.stamp}</Text>
          <Text style={styles.focusCardHelper}>{tabMeta.helper}</Text>
        </View>
        <Text style={styles.focusCardTitle}>{tabMeta.title}</Text>
      </View>

      <Section title={tab === "crew" ? "Friend playlists" : tab === "event" ? "Upcoming event music" : "Always-on genre radio picks"}>
        <View style={styles.cardGrid}>
          {cards.map((card, idx) => (
            <RadioFeatureCard key={card.id} card={card} index={idx} />
          ))}
        </View>
      </Section>

      <Section title="Personalized from your taste + events">
        <View style={styles.signalPill}>
          <View style={styles.tasteChips}>
            {(tasteCore.length > 0 ? tasteCore : ["House", "Techno", "Bass"]).map((genre) => (
              <View key={genre} style={styles.tasteChip}>
                <Text style={styles.tasteChipText}>{genre}</Text>
              </View>
            ))}
          </View>
        </View>
      </Section>
    </ScrollView>
  );
}

function RadioTabChip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.tabChip, props.active && styles.tabChipActive]}>
      <Text style={[styles.tabChipText, props.active && styles.tabChipTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function RadioFeatureCard(props: { card: RadioCard; index: number }) {
  const palette = pickPalette(props.card.accent, props.index);
  return (
    <View style={[styles.radioCard, { backgroundColor: palette.base, borderColor: palette.border }]}>
      <View style={[styles.radioCardGlow, { backgroundColor: palette.glow }]} />
      <View style={[styles.radioCardBeam, { backgroundColor: palette.line }]} />
      <View style={styles.radioCardStamp}>
        <Text style={styles.radioCardStampText}>{props.card.stamp}</Text>
      </View>
      <View style={styles.radioCardFooter}>
        <Text style={styles.radioCardTitle} numberOfLines={2}>{props.card.title}</Text>
        <Text style={styles.radioCardSubtitle} numberOfLines={2}>{props.card.subtitle}</Text>
      </View>
    </View>
  );
}

function buildTabCards(tab: RadioTab, tasteCore: string[], eventGenres: string[]): RadioCard[] {
  const g1 = tasteCore[0] ?? "House";
  const g2 = tasteCore[1] ?? "Techno";
  const g3 = eventGenres[0] ?? tasteCore[2] ?? "Bass";
  const cardsByTab: Record<RadioTab, RadioCard[]> = {
    crew: [
      { id: "crew-1", title: `${g1} Friend Playlist`, subtitle: "Shared by a friend", stamp: "FRIEND", accent: "ember" },
      { id: "crew-2", title: `${g2} Group Playlist`, subtitle: "Pregame rotation", stamp: "GROUP", accent: "blue" },
      { id: "crew-3", title: `Afters Playlist`, subtitle: "Late-night saves", stamp: "AFTERS", accent: "violet" },
      { id: "crew-4", title: `Warmup Playlist`, subtitle: "Easy opener tracks", stamp: "WARMUP", accent: "gold" }
    ],
    event: [
      { id: "event-1", title: `${g3} DJ Radar`, subtitle: "Artists tied to upcoming events", stamp: "EVENT MUSIC", accent: "violet" },
      { id: "event-2", title: `Before Doors`, subtitle: "Warm-up DJs and tracks", stamp: "UPCOMING", accent: "ember" },
      { id: "event-3", title: `Lineup Related`, subtitle: "Similar sounds to the bill", stamp: "LINEUP", accent: "blue" },
      { id: "event-4", title: `After Set`, subtitle: "Post-event listening", stamp: "AFTERS", accent: "gold" }
    ],
    discover: [
      { id: "discover-1", title: `${g1} Radio`, subtitle: "Always-on genre stream", stamp: "GENRE RADIO", accent: "blue" },
      { id: "discover-2", title: `${g2} Radio`, subtitle: "Continuous discovery mix", stamp: "LIVE", accent: "violet" },
      { id: "discover-3", title: `Local Radio`, subtitle: "Nearby taste trends", stamp: "LOCAL", accent: "ember" },
      { id: "discover-4", title: `${g1} x ${g3} Radio`, subtitle: "Blend station", stamp: "BLEND", accent: "gold" }
    ]
  };
  return cardsByTab[tab];
}

function pickPalette(accent: RadioCard["accent"], index: number) {
  const map = {
    ember: { base: "#21160F", border: "rgba(227,108,63,0.25)", glow: "rgba(227,108,63,0.22)", line: "rgba(255,208,188,0.36)" },
    violet: { base: "#1D1729", border: "rgba(125,107,255,0.24)", glow: "rgba(125,107,255,0.2)", line: "rgba(214,203,255,0.32)" },
    blue: { base: "#151E2A", border: "rgba(106,182,255,0.22)", glow: "rgba(106,182,255,0.2)", line: "rgba(196,226,255,0.28)" },
    gold: { base: "#231C12", border: "rgba(255,196,92,0.2)", glow: "rgba(255,196,92,0.16)", line: "rgba(255,231,181,0.28)" }
  } as const;
  return map[accent] ?? Object.values(map)[index % 4];
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
    backgroundColor: theme.colors.canvas
  },
  hero: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#14110E",
    padding: 16,
    gap: 10,
    overflow: "hidden"
  },
  heroGrid: {
    position: "absolute",
    inset: 0,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.02)"
  },
  heroArcA: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,208,188,0.08)",
    right: -90,
    top: -60
  },
  heroArcB: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(227,108,63,0.1)",
    left: -44,
    bottom: 8
  },
  heroGlow: {
    position: "absolute",
    width: 260,
    height: 76,
    borderRadius: 18,
    alignSelf: "center",
    top: 84,
    backgroundColor: "rgba(255,212,196,0.05)",
    transform: [{ rotate: "-8deg" }]
  },
  heroStamp: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  heroStampText: {
    color: "#FFF8EE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6
  },
  eyebrow: {
    color: "rgba(255,220,202,0.66)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9
  },
  heroTitle: {
    color: "#FFF8EE",
    fontSize: 22,
    fontWeight: "800"
  },
  heroSubtitle: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 13,
    lineHeight: 19
  },
  heroVisualStrip: {
    marginTop: 2,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.015)",
    overflow: "hidden"
  },
  heroRouteNodeA: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 999,
    left: -8,
    top: -18,
    backgroundColor: "rgba(125,107,255,0.22)"
  },
  heroRouteNodeB: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 999,
    right: -12,
    bottom: -22,
    backgroundColor: "rgba(227,108,63,0.18)"
  },
  heroRouteNodeC: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 999,
    right: 112,
    top: -14,
    backgroundColor: "rgba(255,220,202,0.05)"
  },
  heroRouteLineA: {
    position: "absolute",
    left: -10,
    right: -10,
    top: 14,
    height: 2,
    backgroundColor: "rgba(216,119,255,0.56)",
    transform: [{ rotate: "-7deg" }]
  },
  heroRouteLineB: {
    position: "absolute",
    left: -6,
    right: -6,
    top: 23,
    height: 2,
    backgroundColor: "rgba(125,107,255,0.52)",
    transform: [{ rotate: "8deg" }]
  },
  heroRouteLineC: {
    position: "absolute",
    left: -10,
    right: -10,
    bottom: 15,
    height: 2,
    backgroundColor: "rgba(255,176,123,0.42)",
    transform: [{ rotate: "-4deg" }]
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
    flexWrap: "wrap"
  },
  tabChip: {
    flexBasis: "31.5%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
    minHeight: 38,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center"
  },
  tabChipActive: {
    borderColor: "rgba(211,92,51,0.34)",
    backgroundColor: "rgba(211,92,51,0.13)"
  },
  tabChipText: {
    color: "rgba(255,249,239,0.74)",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center"
  },
  tabChipTextActive: {
    color: "#FFF8EE"
  },
  focusCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 12,
    gap: 6
  },
  focusCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  focusCardStamp: {
    color: "rgba(255,220,202,0.76)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7
  },
  focusCardHelper: {
    color: "rgba(255,249,239,0.58)",
    fontSize: 11,
    fontWeight: "600"
  },
  focusCardTitle: {
    color: "#FFF8EE",
    fontSize: 18,
    fontWeight: "800"
  },
  section: {
    gap: 8
  },
  sectionTitle: {
    color: "#FFF8EE",
    fontSize: 16,
    fontWeight: "800"
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10
  },
  radioCard: {
    width: "48.5%",
    aspectRatio: 1.12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "space-between"
  },
  radioCardGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    right: -18,
    top: -12
  },
  radioCardBeam: {
    position: "absolute",
    left: -18,
    right: -18,
    top: 38,
    height: 16,
    transform: [{ rotate: "-8deg" }]
  },
  radioCardStamp: {
    alignSelf: "flex-start",
    margin: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(12,11,9,0.46)",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  radioCardStampText: {
    color: "#FFF8EE",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4
  },
  radioCardFooter: {
    padding: 10,
    gap: 4,
    backgroundColor: "rgba(8,8,8,0.26)"
  },
  radioCardTitle: {
    color: "#FFF8EE",
    fontSize: 14,
    fontWeight: "800"
  },
  radioCardSubtitle: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 11,
    lineHeight: 15
  },
  signalPill: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 12
  },
  tasteChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  tasteChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  tasteChipText: {
    color: "rgba(255,249,239,0.86)",
    fontSize: 11,
    fontWeight: "700"
  },
});
