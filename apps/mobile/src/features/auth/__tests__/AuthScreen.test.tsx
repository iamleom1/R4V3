import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AuthScreen } from "../AuthScreen";
import { createTestAppState } from "../../../test/testAppState";

const mockUseAppState = jest.fn();
const mockUseNavigation = jest.fn();
const mockUseRoute = jest.fn();
const mockGetSupabaseClient = jest.fn();
const mockTrackEvent = jest.fn();
const mockInvoke = jest.fn();

jest.mock("../../../app/AppProvider", () => ({
  useAppState: () => mockUseAppState()
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockUseNavigation(),
  useRoute: () => mockUseRoute()
}));

jest.mock("../../../lib/supabase", () => ({
  getSupabaseClient: () => mockGetSupabaseClient()
}));

jest.mock("../../../lib/telemetry", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args)
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppState.mockReturnValue(createTestAppState());
    mockUseNavigation.mockReturnValue({
      canGoBack: () => false,
      goBack: jest.fn()
    });
    mockUseRoute.mockReturnValue({
      params: {}
    });
    mockGetSupabaseClient.mockReturnValue({
      functions: {
        invoke: (...args: unknown[]) => mockInvoke(...args)
      }
    });
    mockInvoke.mockResolvedValue({ data: { exists: true }, error: null });
  });

  it("checks email and advances existing users to password login", async () => {
    const screen = render(<AuthScreen />);

    expect(screen.getByText("Find your crew for events")).toBeOnTheScreen();
    fireEvent.changeText(screen.UNSAFE_getAllByType("TextInput" as any)[0], "tester@example.com");
    fireEvent.press(screen.getByText("Continue with email"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("email-exists", {
        body: { email: "tester@example.com" }
      });
      expect(screen.getByText("Password")).toBeOnTheScreen();
    });
  });

  it("shows the new account hint", () => {
    const screen = render(<AuthScreen />);

    expect(screen.getByText("We'll create an account if you're new.")).toBeOnTheScreen();
  });
});
