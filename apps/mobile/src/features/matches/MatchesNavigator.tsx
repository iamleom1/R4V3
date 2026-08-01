import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { theme } from "../../theme";
import { MatchFiltersScreen } from "./MatchFiltersScreen";
import { MatchesScreen } from "./MatchesScreen";

export type MatchesStackParamList = {
  MatchHome: undefined;
  MatchFilters: undefined;
};

const Stack = createNativeStackNavigator<MatchesStackParamList>();

export function MatchesNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: false,
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: { color: theme.colors.textPrimary, fontWeight: "700" },
        contentStyle: { backgroundColor: theme.colors.canvas }
      }}
    >
      <Stack.Screen name="MatchHome" component={MatchesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MatchFilters" component={MatchFiltersScreen} options={{ title: "Preferences" }} />
    </Stack.Navigator>
  );
}
