import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { EventCrewRoomScreen } from "../events/EventCrewRoomScreen";
import { theme } from "../../theme";
import { ConversationScreen } from "./ConversationScreen";
import { GroupChatScreen } from "./GroupChatScreen";
import { MessagesScreen } from "./MessagesScreen";

export type MessagesStackParamList = {
  MessagesHome: undefined;
  Conversation: {
    matchId: string;
    title: string;
    otherProfileId: string;
  };
  EventCrewRoom: {
    roomId: string;
    roomTitle: string;
    eventTitle: string;
  };
  GroupChat: {
    groupId: string;
    title: string;
  };
};

const Stack = createNativeStackNavigator<MessagesStackParamList>();

export function MessagesNavigator() {
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
      <Stack.Screen name="MessagesHome" component={MessagesScreen} options={{ title: "Chat" }} />
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
      <Stack.Screen
        name="EventCrewRoom"
        component={EventCrewRoomScreen}
        options={({ route }) => ({ title: route.params.roomTitle })}
      />
      <Stack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
    </Stack.Navigator>
  );
}
