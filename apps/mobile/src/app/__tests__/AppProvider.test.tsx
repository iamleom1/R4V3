import React, { useEffect, useRef } from "react";
import { render, waitFor } from "@testing-library/react-native";

import { AppProvider, useAppState } from "../AppProvider";

const mockGetSupabaseClient = jest.fn();
const mockTrackEvent = jest.fn();
const mockInstallCrashReporting = jest.fn();
const mockInstallUnhandledRejectionReporting = jest.fn();
const mockRegisterDevicePushToken = jest.fn();
const mockUnregisterDevicePushToken = jest.fn();

jest.mock("../../lib/supabase", () => ({
  getSupabaseClient: () => mockGetSupabaseClient()
}));

jest.mock("../../features/profile/profileRepository", () => ({
  ensureProfileStubInSupabase: jest.fn(async () => ({ ok: true })),
  deleteMyAccountFromSupabase: jest.fn(async () => ({ ok: true })),
  loadProfileDraftFromSupabase: jest.fn(async () => null),
  upsertProfileDraftToSupabase: jest.fn(async () => ({ ok: true }))
}));

jest.mock("../../lib/pushNotifications", () => ({
  registerDevicePushToken: (...args: unknown[]) => mockRegisterDevicePushToken(...args),
  unregisterDevicePushToken: (...args: unknown[]) => mockUnregisterDevicePushToken(...args)
}));

jest.mock("../../lib/telemetry", () => ({
  installCrashReporting: () => mockInstallCrashReporting(),
  installUnhandledRejectionReporting: () => mockInstallUnhandledRejectionReporting(),
  recordError: jest.fn(),
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args)
}));

function Harness(props: { onDone: (snapshot: { ok: boolean }) => void }) {
  const { updateProfileDraft, completeOnboarding, profileDraft, profileSaveStatus } = useAppState();
  const seededRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) {
      return;
    }
    seededRef.current = true;
    updateProfileDraft({
      displayName: "Leo",
      birthdate: "1995-04-20",
      city: "Los Angeles",
      gender: "Man",
      bio: "House and techno. Down for pregame and sticking with the crew.",
      vibeTags: ["House", "Festival Crew", "Afters"],
      musicGenres: ["EDM", "Tech House"],
      guidelinesAccepted: true
    });
  }, [updateProfileDraft]);

  useEffect(() => {
    if (completedRef.current) {
      return;
    }
    if (!profileDraft.guidelinesAccepted || profileDraft.vibeTags.length < 3 || profileDraft.musicGenres.length < 2) {
      return;
    }
    completedRef.current = true;

    void completeOnboarding().then((ok) => {
      props.onDone({ ok });
    });
  }, [completeOnboarding, profileDraft, profileSaveStatus, props]);

  return null;
}

function AuthHarness(props: { onReady: (snapshot: { authStatus: string; hasSession: boolean }) => void }) {
  const { authStatus, session } = useAppState();

  useEffect(() => {
    if (authStatus === "loading") {
      return;
    }
    props.onReady({ authStatus, hasSession: Boolean(session?.user?.id) });
  }, [authStatus, props, session]);

  return null;
}

describe("AppProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabaseClient.mockReturnValue(null);
    mockRegisterDevicePushToken.mockResolvedValue({ ok: true });
    mockUnregisterDevicePushToken.mockResolvedValue(undefined);
  });

  it("completes onboarding and emits analytics when the profile is valid", async () => {
    const onDone = jest.fn();

    render(
      <AppProvider>
        <Harness onDone={onDone} />
      </AppProvider>
    );

    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });

    expect(onDone.mock.calls.at(-1)?.[0]?.ok).toBe(true);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "onboarding_completed",
      expect.objectContaining({ vibe_count: 3, genre_count: 2 })
    );
  });

  it("restores an existing auth session on app boot", async () => {
    const onReady = jest.fn();
    const unsubscribe = jest.fn();

    mockGetSupabaseClient.mockReturnValue({
      auth: {
        getSession: jest.fn(async () => ({
          data: {
            session: {
              user: {
                id: "user-123",
                email: "leo@example.com"
              }
            }
          }
        })),
        onAuthStateChange: jest.fn(() => ({
          data: {
            subscription: {
              unsubscribe
            }
          }
        }))
      }
    });

    render(
      <AppProvider>
        <AuthHarness onReady={onReady} />
      </AppProvider>
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith({ authStatus: "authenticated", hasSession: true });
    });

    expect(mockTrackEvent).toHaveBeenCalledWith("auth_session_restored", { source: "app_boot" });
  });
});
