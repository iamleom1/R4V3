import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { theme } from "../../theme";
import { AdminAnalyticsScreen } from "./AdminAnalyticsScreen";
import { EventCurationScreen } from "./EventCurationScreen";
import { ModerationQueueScreen } from "./ModerationQueueScreen";
import { ProfilePhotosScreen } from "./ProfilePhotosScreen";
import { ProfileScreen } from "./ProfileScreen";
import { ScraperSourceEventsScreen } from "./ScraperSourceEventsScreen";
import { ScraperStatusScreen } from "./ScraperStatusScreen";
import { SystemAlertsScreen } from "./SystemAlertsScreen";

export type ProfileStackParamList = {
  ProfileHome: undefined;
  ProfilePhotos: undefined;
  ModerationQueue: undefined;
  AdminAnalytics: undefined;
  EventCuration: undefined;
  SystemAlerts: undefined;
  ScraperStatus: undefined;
  ScraperSourceEvents: { source: "posh" | "dice" };
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
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
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: "Profile" }} />
      <Stack.Screen name="ProfilePhotos" component={ProfilePhotosScreen} options={{ title: "Edit Photos" }} />
      <Stack.Screen name="ModerationQueue" component={ModerationQueueScreen} options={{ title: "Moderation" }} />
      <Stack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} options={{ title: "Analytics" }} />
      <Stack.Screen name="EventCuration" component={EventCurationScreen} options={{ title: "Event Curation" }} />
      <Stack.Screen name="SystemAlerts" component={SystemAlertsScreen} options={{ title: "System Alerts" }} />
      <Stack.Screen name="ScraperStatus" component={ScraperStatusScreen} options={{ title: "Scraper Status" }} />
      <Stack.Screen
        name="ScraperSourceEvents"
        component={ScraperSourceEventsScreen}
        options={({ route }) => ({
          title: route.params.source === "posh" ? "POSH Events" : "DICE Events"
        })}
      />
    </Stack.Navigator>
  );
}
