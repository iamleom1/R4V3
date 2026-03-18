import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { theme } from "../../theme";
import { ConversationScreen } from "./ConversationScreen";
import { MessagesScreen } from "./MessagesScreen";

export type MessagesStackParamList = {
  MessagesHome: undefined;
  Conversation: {
    matchId: string;
    title: string;
    otherProfileId: string;
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
    </Stack.Navigator>
  );
}
