import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { OnboardingScreen } from "../OnboardingScreen";
import { createTestAppState } from "../../../test/testAppState";

const mockUseAppState = jest.fn();

jest.mock("../../../app/AppProvider", () => ({
  useAppState: () => mockUseAppState()
}));

jest.mock("../../profile/deviceLocationService", () => ({
  captureCurrentDeviceLocation: jest.fn(async () => ({
    ok: true,
    location: {
      city: "Los Angeles",
      latitude: 34.05,
      longitude: -118.24,
      accuracyMeters: 50,
      capturedAt: "2026-04-09T00:00:00.000Z"
    }
  }))
}));

describe("OnboardingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the identity step with next disabled until required fields are present", () => {
    mockUseAppState.mockReturnValue(createTestAppState());
    const screen = render(<OnboardingScreen />);

    expect(screen.getByText("Build your profile with intent")).toBeOnTheScreen();
    expect(screen.getByText("Step 1 of 4: Identity")).toBeOnTheScreen();
    expect(screen.getByText("Next")).toBeOnTheScreen();
  });

  it("advances when the first step is complete", () => {
    const updateProfileDraft = jest.fn();
    mockUseAppState.mockReturnValue(
      createTestAppState({
        profileDraft: {
          ...createTestAppState().profileDraft,
          displayName: "Leo",
          birthdate: "1995-04-20",
          city: "Los Angeles"
        },
        updateProfileDraft
      })
    );

    const screen = render(<OnboardingScreen />);
    fireEvent.press(screen.getByText("Next"));

    expect(screen.getByText("Step 2 of 4: Vibe + Music")).toBeOnTheScreen();
  });
});
