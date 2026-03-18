import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useAppState } from "../../app/AppProvider";
import { theme } from "../../theme";

const distanceOptions = [10, 25, 50, 100];
const expansionOptions = [50, 100, 200];
const musicOptions = ["House", "Techno", "Dubstep", "Drum & Bass", "Trance", "Afrobeats"];

export function MatchFiltersScreen() {
  const { matchFilters, updateMatchFilters } = useAppState();
  const { distanceMiles, expansionDistanceMiles, musicTypes, soberPreference, groupPreference, strictDistance } = matchFilters;

  const summary = useMemo(() => {
    const musicSummary = musicTypes.length ? musicTypes.slice(0, 2).join(", ") : "Any music";
    return strictDistance
      ? `${distanceMiles} mi strict • ${musicSummary}`
      : `${distanceMiles}→${expansionDistanceMiles} mi expansion • ${musicSummary}`;
  }, [distanceMiles, expansionDistanceMiles, musicTypes, strictDistance]);

  function toggleMusic(value: string) {
    const next = musicTypes.includes(value) ? musicTypes.filter((v) => v !== value) : [...musicTypes, value];
    updateMatchFilters({ musicTypes: next });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Match Filters</Text>
        <Text style={styles.heroTitle}>Tune your stack</Text>
        <Text style={styles.heroBody}>Filter by distance, music, sober preference, and whether you want groups or individuals.</Text>
        <Text style={styles.heroMeta}>{summary}</Text>
      </View>

      <FilterCard title="Location Range">
        <View style={styles.optionRow}>
          {distanceOptions.map((miles) => {
            const active = distanceMiles === miles;
            return (
              <Pressable
                key={miles}
                onPress={() =>
                  updateMatchFilters({
                    distanceMiles: miles,
                    expansionDistanceMiles: Math.max(expansionDistanceMiles, miles)
                  })
                }
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{miles} mi</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Only show people in this range</Text>
            <Text style={styles.settingSub}>Turn off to allow spillover when the stack is low.</Text>
          </View>
          <Switch
            value={strictDistance}
            onValueChange={(value) => updateMatchFilters({ strictDistance: value })}
            trackColor={{ false: "#3B352D", true: theme.colors.accent }}
            thumbColor="#FFF2E2"
          />
        </View>
        {!strictDistance ? (
          <View style={styles.settingBlock}>
            <Text style={styles.settingLabel}>Expansion Radius (when stack is low)</Text>
            <View style={styles.optionRow}>
              {expansionOptions.map((miles) => {
                const active = expansionDistanceMiles === miles;
                return (
                  <Pressable
                    key={`expand-${miles}`}
                    onPress={() => updateMatchFilters({ expansionDistanceMiles: Math.max(miles, distanceMiles) })}
                    style={[styles.pill, active && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{miles} mi</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </FilterCard>

      <FilterCard title="Music Type">
        <View style={styles.wrapRow}>
          {musicOptions.map((genre) => {
            const active = musicTypes.includes(genre);
            return (
              <Pressable key={genre} onPress={() => toggleMusic(genre)} style={[styles.pill, active && styles.pillActive]}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{genre}</Text>
              </Pressable>
            );
          })}
        </View>
      </FilterCard>

      <FilterCard title="Sober / Non-Sober">
        <Segmented
          value={soberPreference}
          onChange={(v) => updateMatchFilters({ soberPreference: v as typeof soberPreference })}
          items={[
            { key: "all", label: "All" },
            { key: "sober", label: "Sober" },
            { key: "non_sober", label: "Non-Sober" }
          ]}
        />
      </FilterCard>

      <FilterCard title="Groups or Individuals">
        <Segmented
          value={groupPreference}
          onChange={(v) => updateMatchFilters({ groupPreference: v as typeof groupPreference })}
          items={[
            { key: "all", label: "Both" },
            { key: "groups", label: "Groups" },
            { key: "individuals", label: "Individuals" }
          ]}
        />
      </FilterCard>
    </ScrollView>
  );
}

function FilterCard(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{props.title}</Text>
      <View style={styles.cardBody}>{props.children}</View>
    </View>
  );
}

function Segmented(props: {
  value: string;
  onChange: (v: string) => void;
  items: Array<{ key: string; label: string }>;
}) {
  return (
    <View style={styles.segmented}>
      {props.items.map((item) => {
        const active = props.value === item.key;
        return (
          <Pressable key={item.key} onPress={() => props.onChange(item.key)} style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#11100D"
  },
  container: {
    padding: 16,
    gap: 12,
    backgroundColor: "#11100D"
  },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 14,
    gap: 6
  },
  eyebrow: {
    color: theme.colors.textSecondary,
    ...theme.type.eyebrow
  },
  heroTitle: {
    color: "#FFF8EE",
    ...theme.type.titleLg
  },
  heroBody: {
    color: theme.colors.textSecondary,
    ...theme.type.body
  },
  heroMeta: {
    color: "#FFC7B2",
    ...theme.type.caption,
    fontWeight: "700"
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 10
  },
  cardTitle: {
    color: "#FFF8EE",
    fontWeight: "700",
    fontSize: 15
  },
  cardBody: {
    gap: 10
  },
  optionRow: {
    flexDirection: "row",
    gap: 8
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  pillActive: {
    borderColor: "rgba(211,92,51,0.45)",
    backgroundColor: "rgba(211,92,51,0.14)"
  },
  pillText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  pillTextActive: {
    color: "#FFF8EE"
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center"
  },
  settingCopy: {
    flex: 1,
    gap: 2
  },
  settingBlock: {
    gap: 8
  },
  settingLabel: {
    color: "#FFF8EE",
    fontSize: 13,
    fontWeight: "600"
  },
  settingSub: {
    color: theme.colors.textSecondary,
    ...theme.type.caption
  },
  segmented: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 4,
    flexDirection: "row",
    gap: 4
  },
  segment: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center"
  },
  segmentActive: {
    backgroundColor: "rgba(211,92,51,0.16)",
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.35)"
  },
  segmentText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700"
  },
  segmentTextActive: {
    color: "#FFF8EE"
  }
});
