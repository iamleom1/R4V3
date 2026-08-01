import "react-native-gesture-handler";
import React, { useEffect, useRef } from "react";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { AppScreen } from "./src/components/AppScreen";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { AppProvider, useAppState } from "./src/app/AppProvider";
import { AuthScreen } from "./src/features/auth/AuthScreen";
import { DiscoverNavigator } from "./src/features/events/DiscoverNavigator";
import { MatchesNavigator } from "./src/features/matches/MatchesNavigator";
import { MessagesNavigator } from "./src/features/messages/MessagesNavigator";
import { OnboardingScreen } from "./src/features/onboarding/OnboardingScreen";
import { ProfileNavigator } from "./src/features/profile/ProfileNavigator";
import { getPendingNotificationConversation } from "./src/lib/pushNotifications";
import { trackEvent } from "./src/lib/telemetry";
import { theme } from "./src/theme";

type RootTabs = {
  Match: undefined;
  Discover: undefined;
  Messages: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabs>();
const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef<any>();
let lastTrackedScreen = "";

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.canvas,
    card: theme.colors.surface,
    text: theme.colors.textPrimary,
    border: theme.colors.border,
    primary: theme.colors.accent
  }
};

function MainTabs() {
  const { session } = useAppState();
  const isSignedIn = Boolean(session?.user?.id);

  return (
    <Tab.Navigator
      initialRouteName="Discover"
      screenOptions={({ route }) => {
        return {
          headerShown: route.name !== "Match",
          headerStyle: { backgroundColor: theme.colors.surface },
          headerShadowVisible: false,
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { color: theme.colors.textPrimary, fontWeight: "700" },
          sceneStyle: {
            backgroundColor: route.name === "Match" ? "#11100D" : theme.colors.canvas
          },
          tabBarStyle: {
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 12,
            backgroundColor: "transparent",
            borderTopWidth: 0,
            height: 66,
            paddingTop: 6,
            paddingBottom: 6,
            paddingHorizontal: 8,
            borderRadius: 30,
            shadowColor: "#000000",
            shadowOpacity: 0.45,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 0
          },
          tabBarBackground: () => (
            <View style={styles.tabBarGlass}>
              <LinearGradient
                colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.03)", "rgba(255,255,255,0.00)"]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={["rgba(19,19,19,0.96)", "rgba(11,11,11,0.94)"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.tabBarGlassHighlight} />
            </View>
          ),
          tabBarItemStyle: {
            marginHorizontal: 2,
            borderRadius: 24,
            paddingVertical: 2
          },
          tabBarActiveBackgroundColor: "rgba(255,255,255,0.13)",
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
            letterSpacing: 0,
            marginTop: 0
          },
          tabBarIcon: ({ focused, color }) => <TabIcon routeName={route.name} focused={focused} color={color} />,
          tabBarActiveTintColor: "#F2EEE6",
          tabBarInactiveTintColor: "rgba(255,255,255,0.46)"
        };
      }}
    >
      <Tab.Screen name="Discover" component={DiscoverNavigator} options={{ headerShown: false, tabBarLabel: "Events" }} />
      <Tab.Screen name="Match" component={MatchesNavigator} options={{ headerShown: false, tabBarLabel: "Crew" }} />
      <Tab.Screen name="Messages" component={MessagesNavigator} options={{ headerShown: false, tabBarLabel: "Chat" }} />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ headerShown: false }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            if (isSignedIn) return;
            event.preventDefault();
            const rootNav: any = navigation.getParent();
            rootNav?.navigate?.("Auth");
          }
        })}
      />
    </Tab.Navigator>
  );
}

function TabIcon(props: { routeName: keyof RootTabs; focused: boolean; color: string }) {
  const { routeName, focused, color } = props;
  const shellStyle = [
    tabIconStyles.shell,
    focused ? tabIconStyles.shellFocused : null
  ];

  if (routeName === "Match") {
    return (
      <View style={shellStyle}>
        <View style={[tabIconStyles.matchDiamond, { borderColor: color }]} />
        <View style={[tabIconStyles.matchCenterDot, { backgroundColor: color }]} />
        {focused ? <ActiveTabLine /> : null}
      </View>
    );
  }

  if (routeName === "Discover") {
    return (
      <View style={shellStyle}>
        <View style={[tabIconStyles.calendarBody, { borderColor: color }]}>
          <View style={[tabIconStyles.calendarBinderLeft, { backgroundColor: color }]} />
          <View style={[tabIconStyles.calendarBinderRight, { backgroundColor: color }]} />
          <View style={[tabIconStyles.calendarDivider, { backgroundColor: color }]} />
        </View>
        {focused ? <ActiveTabLine /> : null}
      </View>
    );
  }

  if (routeName === "Messages") {
    return (
      <View style={shellStyle}>
        <View style={[tabIconStyles.chatBubble, { borderColor: color }]}>
          <View style={[tabIconStyles.chatLine, { backgroundColor: color }]} />
          <View style={[tabIconStyles.chatLineShort, { backgroundColor: color }]} />
        </View>
        <View style={[tabIconStyles.chatTail, { borderTopColor: color }]} />
        {focused ? <ActiveTabLine /> : null}
      </View>
    );
  }

  return (
    <View style={shellStyle}>
      <View style={[tabIconStyles.profileHead, { borderColor: color }]} />
      <View style={[tabIconStyles.profileBody, { borderColor: color }]} />
      {focused ? <ActiveTabLine /> : null}
    </View>
  );
}

function ActiveTabLine() {
  return (
    <View style={tabIconStyles.activeLine}>
      <View style={tabIconStyles.activeLinePurple} />
      <View style={tabIconStyles.activeLinePink} />
    </View>
  );
}

function RootNavigator() {
  const { authStatus, profileDraft, profileHydrationComplete, session } = useAppState();

  if (authStatus === "loading") {
    return (
      <View style={styles.bootGate}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="Auth" component={AuthScreen} options={{ presentation: "modal" }} />
      </Stack.Navigator>
    );
  }

  if (session?.user?.id && !profileHydrationComplete) {
    return (
      <View style={styles.bootGate}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!profileDraft.onboardingCompleted) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerShadowVisible: false,
          headerTintColor: theme.colors.textPrimary
        }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: "Set Up Your Profile" }} />
      </Stack.Navigator>
    );
  }

  return <MainTabs />;
}

function NotificationCoordinator() {
  const { authStatus, profileDraft } = useAppState();
  const lastHandledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated" || !profileDraft.onboardingCompleted) {
      return;
    }

    function openFromNotification(response: Notifications.NotificationResponse | null) {
      if (!response) {
        return;
      }

      const responseId = response.notification.request.identifier;
      if (responseId && lastHandledResponseId.current === responseId) {
        return;
      }

      const conversation = getPendingNotificationConversation(
        response.notification.request.content.data as Record<string, unknown> | undefined
      );
      if (!conversation) {
        return;
      }

      lastHandledResponseId.current = responseId;
      const navigate = () =>
        navigationRef.navigate("Messages", {
          screen: "Conversation",
          params: {
            matchId: conversation.matchId,
            title: conversation.title,
            otherProfileId: conversation.otherProfileId
          }
        });

      if (navigationRef.isReady()) {
        navigate();
      } else {
        setTimeout(() => {
          if (navigationRef.isReady()) {
            navigate();
          }
        }, 400);
      }
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    void Notifications.getLastNotificationResponseAsync().then(openFromNotification);

    return () => {
      subscription.remove();
    };
  }, [authStatus, profileDraft.onboardingCompleted]);

  return null;
}

export default function App() {
  function handleNavigationStateChange() {
    if (!navigationRef.isReady()) {
      return;
    }

    const route = navigationRef.getCurrentRoute();
    const screenName = route?.name ?? "";
    if (!screenName || screenName === lastTrackedScreen) {
      return;
    }

    lastTrackedScreen = screenName;
    void trackEvent("screen_view", {
      screen_name: screenName
    });
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <AppProvider>
          <AppErrorBoundary>
            <NavigationContainer
              ref={navigationRef}
              theme={navTheme}
              onReady={handleNavigationStateChange}
              onStateChange={handleNavigationStateChange}
            >
              <StatusBar style="light" />
              <AppScreen>
                <RootNavigator />
                <NotificationCoordinator />
              </AppScreen>
            </NavigationContainer>
          </AppErrorBoundary>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const tabIconStyles = StyleSheet.create({
  shell: {
    width: 38,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12
  },
  shellFocused: {
    backgroundColor: "transparent"
  },
  activeLine: {
    position: "absolute",
    bottom: -5,
    width: 30,
    height: 3,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row"
  },
  activeLinePurple: {
    width: 18,
    backgroundColor: "#7157FF"
  },
  activeLinePink: {
    flex: 1,
    backgroundColor: "#FF6A33"
  },
  calendarBody: {
    position: "absolute",
    width: 19,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.7,
    alignItems: "center"
  },
  calendarBinderLeft: {
    position: "absolute",
    top: -2,
    left: 4,
    width: 2.4,
    height: 5,
    borderRadius: 2
  },
  calendarBinderRight: {
    position: "absolute",
    top: -2,
    right: 4,
    width: 2.4,
    height: 5,
    borderRadius: 2
  },
  calendarDivider: {
    position: "absolute",
    top: 5,
    left: 2,
    right: 2,
    height: 1.4,
    borderRadius: 2
  },
  matchDiamond: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 4,
    transform: [{ rotate: "45deg" }]
  },
  matchCenterDot: {
    position: "absolute",
    width: 3.5,
    height: 3.5,
    borderRadius: 999
  },
  chatBubble: {
    width: 19,
    height: 15,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 2
  },
  chatLine: {
    width: 9,
    height: 1.6,
    borderRadius: 2
  },
  chatLineShort: {
    width: 6,
    height: 1.6,
    borderRadius: 2
  },
  chatTail: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 0,
    borderTopWidth: 4,
    borderLeftColor: "transparent",
    top: 18,
    left: 19
  },
  profileHead: {
    width: 8.5,
    height: 8.5,
    borderRadius: 999,
    borderWidth: 1.5
  },
  profileBody: {
    position: "absolute",
    bottom: 4,
    width: 16,
    height: 9,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: 0,
    borderWidth: 1.5
  }
});

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1
  },
  bootGate: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
    alignItems: "center",
    justifyContent: "center"
  },
  tabBarGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(12,12,12,0.94)"
  },
  tabBarGlassHighlight: {
    position: "absolute",
    top: 1,
    left: 26,
    right: 26,
    height: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)"
  }
});
