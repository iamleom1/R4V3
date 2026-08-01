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
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();

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
      },
      auth: {
        signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
        signUp: (...args: unknown[]) => mockSignUp(...args)
      }
    });
    mockInvoke.mockImplementation((name: string) => {
      if (name === "email-exists") {
        return Promise.resolve({ data: { exists: true }, error: null });
      }
      return Promise.resolve({ data: { ok: true }, error: null });
    });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockSignUp.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
  });

  it("checks email and advances existing users to password login", async () => {
    const screen = render(<AuthScreen />);

    expect(screen.getByText(/Find your crew/i)).toBeOnTheScreen();
    fireEvent.changeText(screen.UNSAFE_getAllByType("TextInput" as any)[0], "tester@example.com");
    fireEvent.press(screen.getByText("CONTINUE"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("email-exists", {
        body: { email: "tester@example.com" }
      });
      expect(screen.getByText("Welcome back")).toBeOnTheScreen();
    });
  });

  it("shows the account check hint", () => {
    const screen = render(<AuthScreen />);

    expect(screen.getByText("We'll check if you already have an account.")).toBeOnTheScreen();
  });

  it("routes unknown users to password signup", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { exists: false }, error: null });

    const screen = render(<AuthScreen />);

    fireEvent.changeText(screen.UNSAFE_getAllByType("TextInput" as any)[0], "tester@example.com");
    fireEvent.press(screen.getByText("CONTINUE"));

    await waitFor(() => {
      expect(screen.getByText("Create your account")).toBeOnTheScreen();
    });
  });
});
