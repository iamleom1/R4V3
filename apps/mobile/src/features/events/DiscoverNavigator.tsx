import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { EventDiscoveryScreen } from "./EventDiscoveryScreen";
import { EventCrewRoomScreen } from "./EventCrewRoomScreen";
import { EventDetailScreen } from "./EventDetailScreen";
import { EventMatchScreen } from "./EventMatchScreen";
import { RaveRadioScreen } from "./RaveRadioScreen";
import { WeekendEventsScreen } from "./WeekendEventsScreen";
import { theme } from "../../theme";
import type { EventRecord } from "../../types/domain";

export type DiscoverStackParamList = {
  DiscoverHome: undefined;
  EventDetail: { event: EventRecord };
  EventCrewRoom: { roomId: string; roomTitle: string; eventTitle: string };
  EventMatch: { event: EventRecord };
  RaveRadio: { eventGenres: string[] };
  WeekendEvents: { weekendEvents: EventRecord[]; selectedEventId?: string };
};

const Stack = createNativeStackNavigator<DiscoverStackParamList>();

export function DiscoverNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: { color: theme.colors.textPrimary, fontWeight: "700" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.canvas }
      }}
    >
      <Stack.Screen name="DiscoverHome" component={EventDiscoveryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EventCrewRoom" component={EventCrewRoomScreen} options={({ route }) => ({ title: route.params.roomTitle })} />
      <Stack.Screen name="EventMatch" component={EventMatchScreen} options={{ title: "Event Matching" }} />
      <Stack.Screen name="RaveRadio" component={RaveRadioScreen} options={{ title: "R4V3 Radio" }} />
      <Stack.Screen name="WeekendEvents" component={WeekendEventsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
