import "@testing-library/jest-native/extend-expect";

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => undefined;
  return Reanimated;
});

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[test]" })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: {
    DEFAULT: 3
  }
}));

jest.mock("expo-linear-gradient", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    LinearGradient: ({ children, ...props }: any) => React.createElement(View, props, children)
  };
});

jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1
  },
  AppleAuthenticationCredentialState: {
    AUTHORIZED: 1
  },
  signInAsync: jest.fn(async () => ({
    user: "apple-user-id",
    identityToken: "apple-identity-token",
    email: "tester@example.com"
  }))
}));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: {
    SHA256: "SHA-256"
  },
  digestStringAsync: jest.fn(async () => "mock-digest")
}));

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted", granted: true })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: 34.0522,
      longitude: -118.2437,
      accuracy: 50
    }
  })),
  reverseGeocodeAsync: jest.fn(async () => [{ city: "Los Angeles", region: "CA", country: "United States" }]),
  Accuracy: {
    Balanced: 3
  }
}));

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

jest.mock("@react-native-community/slider", () => {
  const React = require("react");
  const { View } = require("react-native");

  return function MockSlider() {
    return React.createElement(View, { testID: "mock-slider" });
  };
});

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null
}));

jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children
}));
