import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { theme } from "../../theme";
import { ModerationQueueScreen } from "./ModerationQueueScreen";
import { ProfilePhotosScreen } from "./ProfilePhotosScreen";
import { ProfileScreen } from "./ProfileScreen";

export type ProfileStackParamList = {
  ProfileHome: undefined;
  ProfilePhotos: undefined;
  ModerationQueue: undefined;
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
    </Stack.Navigator>
  );
}
