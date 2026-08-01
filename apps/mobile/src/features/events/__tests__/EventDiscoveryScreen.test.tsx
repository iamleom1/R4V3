import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { EventDiscoveryScreen } from "../EventDiscoveryScreen";
import { createTestAppState } from "../../../test/testAppState";
import type { EventRecord } from "../../../types/domain";

const mockUseAppState = jest.fn();
const mockUseSafeAreaInsets = jest.fn();
const mockListUpcomingEvents = jest.fn();
const mockListEventAudienceMetrics = jest.fn();
const mockHasEventCrewChat = jest.fn();
const mockRefreshRsvps = jest.fn();
const mockAudioPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  replace: jest.fn()
};
const futureStartsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

jest.mock("../../../app/AppProvider", () => ({
  useAppState: () => mockUseAppState()
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets()
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn()
}));

jest.mock("../../../components/RemoteImage", () => ({
  RemoteImage: () => null,
  prefetchRemoteImages: jest.fn()
}));

jest.mock("expo-audio", () => ({
  AudioModule: {
    AudioPlayer: jest.fn(() => mockAudioPlayer)
  },
  setAudioModeAsync: jest.fn(async () => {})
}));

jest.mock("../useEventRsvpState", () => ({
  useEventRsvpState: () => ({
    rsvps: {},
    setRsvp: jest.fn(async () => ({ ok: true })),
    refreshRsvps: mockRefreshRsvps
  })
}));

jest.mock("../eventRepository", () => ({
  listUpcomingEvents: (...args: unknown[]) => mockListUpcomingEvents(...args),
  listEventAudienceMetrics: (...args: unknown[]) => mockListEventAudienceMetrics(...args),
  hasEventCrewChat: (...args: unknown[]) => mockHasEventCrewChat(...args)
}));

const sampleEvent: EventRecord = {
  id: "event-1",
  title: "Warehouse Pulse",
  venueName: "District 9",
  city: "Los Angeles",
  startsAt: futureStartsAt,
  endsAt: null,
  genreTags: ["House"],
  sourcePrimary: "manual",
  isFeatured: true,
  promotionRank: 10,
  featuredUntil: null,
  curationNote: "Top pick",
  flyerUrl: null,
  musicPreviewUrl: "https://example.com/preview"
};

describe("EventDiscoveryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioPlayer.play.mockReset();
    mockAudioPlayer.pause.mockReset();
    mockAudioPlayer.replace.mockReset();
    mockUseAppState.mockReturnValue(
      createTestAppState({
        authStatus: "authenticated",
        session: { user: { id: "user-1", email: "test@example.com" } } as any,
        profileDraft: {
          ...createTestAppState().profileDraft,
          city: "Los Angeles",
          locationLat: 34.0522,
          locationLng: -118.2437
        }
      })
    );
    mockUseSafeAreaInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
    mockListUpcomingEvents.mockResolvedValue([sampleEvent]);
    mockListEventAudienceMetrics.mockResolvedValue({
      "event-1": { goingCount: 4, lookingForCrewCount: 2 }
    });
    mockHasEventCrewChat.mockResolvedValue(false);
    mockRefreshRsvps.mockResolvedValue({});
  });

  it("loads signed-in discovery data and renders fetched events", async () => {
    const navigation = {
      navigate: jest.fn(),
      getParent: () => ({ getParent: () => ({ navigate: jest.fn() }) })
    } as any;

    const screen = render(<EventDiscoveryScreen navigation={navigation} route={{ key: "DiscoverHome", name: "DiscoverHome" } as any} />);

    await waitFor(() => {
      expect(mockListUpcomingEvents).toHaveBeenCalled();
      expect(screen.getAllByText("Warehouse Pulse").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Los Angeles/).length).toBeGreaterThan(0);
      expect(screen.getByText("I'm Going")).toBeOnTheScreen();
    });
  });

  it("opens the event preview URL when the preview control is pressed", async () => {
    const navigation = {
      navigate: jest.fn(),
      getParent: () => ({ getParent: () => ({ navigate: jest.fn() }) })
    } as any;
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const screen = render(<EventDiscoveryScreen navigation={navigation} route={{ key: "DiscoverHome", name: "DiscoverHome" } as any} />);

    await waitFor(() => {
      expect(screen.getAllByText("Warehouse Pulse").length).toBeGreaterThan(0);
      expect(screen.getByText("▶")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText("▶"));

    await waitFor(() => {
      expect(mockAudioPlayer.replace).toHaveBeenCalledWith("https://example.com/preview");
      expect(mockAudioPlayer.play).toHaveBeenCalled();
    });
    expect(alertSpy).not.toHaveBeenCalledWith(
      "Preview pending dev build",
      expect.any(String)
    );

    alertSpy.mockRestore();
  });
});
