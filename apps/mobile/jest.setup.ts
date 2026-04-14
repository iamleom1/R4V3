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

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null
}));

jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children
}));
