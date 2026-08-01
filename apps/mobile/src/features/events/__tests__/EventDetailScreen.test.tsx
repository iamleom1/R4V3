import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { EventDetailScreen } from "../EventDetailScreen";
import { createTestAppState } from "../../../test/testAppState";
import type { EventRecord } from "../../../types/domain";

const mockUseAppState = jest.fn();
const mockUseSafeAreaInsets = jest.fn();
const mockSetRsvp = jest.fn();
const mockRefreshRsvps = jest.fn();
const mockSetLooking = jest.fn();
const mockListEventAudienceMetrics = jest.fn();
const mockListEventAttendeePreview = jest.fn();
const mockHasEventCrewChat = jest.fn();
const mockGetEventSourceUrl = jest.fn();
const mockAudioPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  replace: jest.fn()
};
let mockRsvpMap: Record<string, "going" | "none"> = { "event-1": "none" };
let mockVisibilityMap: Record<string, boolean> = { "event-1": false };

jest.mock("../../../app/AppProvider", () => ({
  useAppState: () => mockUseAppState()
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets()
}));

jest.mock("../../../components/RemoteImage", () => ({
  RemoteImage: () => null
}));

jest.mock("expo-audio", () => ({
  AudioModule: {
    AudioPlayer: jest.fn(() => mockAudioPlayer)
  },
  setAudioModeAsync: jest.fn(async () => {})
}));

jest.mock("../useEventRsvpState", () => ({
  useEventRsvpState: () => ({
    rsvps: mockRsvpMap,
    setRsvp: mockSetRsvp,
    refreshRsvps: mockRefreshRsvps
  })
}));

jest.mock("../useCrewVisibilityState", () => ({
  useCrewVisibilityState: () => ({
    visibility: mockVisibilityMap,
    setLooking: mockSetLooking
  })
}));

jest.mock("../eventRepository", () => ({
  getEventSourceUrl: (...args: unknown[]) => mockGetEventSourceUrl(...args),
  hasEventCrewChat: (...args: unknown[]) => mockHasEventCrewChat(...args),
  listEventAttendeePreview: (...args: unknown[]) => mockListEventAttendeePreview(...args),
  listEventAudienceMetrics: (...args: unknown[]) => mockListEventAudienceMetrics(...args)
}));

const event: EventRecord = {
  id: "event-1",
  title: "Warehouse Pulse",
  venueName: "District 9",
  city: "Los Angeles",
  startsAt: "2026-05-01T03:00:00.000Z",
  endsAt: null,
  genreTags: ["House"],
  sourcePrimary: "manual",
  isFeatured: true,
  promotionRank: 10,
  featuredUntil: null,
  curationNote: null,
  flyerUrl: null,
  musicPreviewUrl: "https://example.com/preview"
};

describe("EventDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioPlayer.play.mockReset();
    mockAudioPlayer.pause.mockReset();
    mockAudioPlayer.replace.mockReset();
    mockUseAppState.mockReturnValue(
      createTestAppState({
        authStatus: "authenticated",
        session: { user: { id: "user-1", email: "test@example.com" } } as any
      })
    );
    mockUseSafeAreaInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
    mockRsvpMap = { "event-1": "none" };
    mockVisibilityMap = { "event-1": false };
    mockSetRsvp.mockResolvedValue({ ok: true });
    mockRefreshRsvps.mockResolvedValue({});
    mockSetLooking.mockResolvedValue({ ok: true });
    mockListEventAudienceMetrics
      .mockResolvedValueOnce({ "event-1": { goingCount: 4, lookingForCrewCount: 1 } })
      .mockResolvedValue({ "event-1": { goingCount: 5, lookingForCrewCount: 2 } });
    mockListEventAttendeePreview.mockResolvedValue([]);
    mockHasEventCrewChat.mockResolvedValue(false);
    mockGetEventSourceUrl.mockResolvedValue(null);
  });

  it("writes RSVP changes for a signed-in user", async () => {
    const navigation = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      canGoBack: () => true,
      getParent: () => null
    } as any;

    const screen = render(
      <EventDetailScreen
        navigation={navigation}
        route={{ key: "EventDetail", name: "EventDetail", params: { event } } as any}
      />
    );

    await waitFor(() => {
      expect(mockListEventAudienceMetrics).toHaveBeenCalledWith(["event-1"]);
      expect(screen.getByText("I'm Going")).toBeOnTheScreen();
      expect(screen.queryByText("Find a Crew")).toBeNull();
    });

    fireEvent.press(screen.getByText("I'm Going"));

    await waitFor(() => {
      expect(mockSetRsvp).toHaveBeenCalledWith("event-1", "going");
      expect(screen.getByText("You're going 🎉")).toBeOnTheScreen();
      expect(screen.getByText("Not now")).toBeOnTheScreen();
    });
  });

  it("can dismiss the immediate crew prompt after going", async () => {
    const navigation = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      canGoBack: () => true,
      getParent: () => null
    } as any;

    const screen = render(
      <EventDetailScreen
        navigation={navigation}
        route={{ key: "EventDetail", name: "EventDetail", params: { event } } as any}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("I'm Going")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText("I'm Going"));

    await waitFor(() => {
      expect(screen.getByText("You're going 🎉")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText("Not now"));

    await waitFor(() => {
      expect(screen.queryByText("You're going 🎉")).toBeNull();
    });
  });

  it("writes crew visibility changes when the user is already going", async () => {
    mockRsvpMap = { "event-1": "going" };
    const navigation = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      canGoBack: () => true,
      getParent: () => null
    } as any;

    const screen = render(
      <EventDetailScreen
        navigation={navigation}
        route={{ key: "EventDetail", name: "EventDetail", params: { event } } as any}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Going").length).toBeGreaterThan(0);
      expect(screen.getByText("Find Crew")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText("Find Crew"));

    await waitFor(() => {
      expect(mockSetLooking).toHaveBeenCalledWith("event-1", true);
    });
  });

  it("renders hidden location notes as a location fallback", async () => {
    const navigation = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      canGoBack: () => true,
      getParent: () => null
    } as any;

    const hiddenLocationEvent: EventRecord = {
      ...event,
      city: "The location will be revealed on the event date"
    };

    const screen = render(
      <EventDetailScreen
        navigation={navigation}
        route={{ key: "EventDetail", name: "EventDetail", params: { event: hiddenLocationEvent } } as any}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Location")).toBeOnTheScreen();
      expect(screen.getByText("TBA (revealed day of event)")).toBeOnTheScreen();
      expect(screen.queryByText("City")).toBeNull();
    });
  });

});
