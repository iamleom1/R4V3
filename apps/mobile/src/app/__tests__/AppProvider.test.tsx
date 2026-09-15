import React, { useEffect, useRef } from "react";
import { act, render, waitFor } from "@testing-library/react-native";

import { AppProvider, useAppState, type AppStateValue } from "../AppProvider";
import { deleteMyAccountFromSupabase, loadProfileDraftFromSupabase, upsertProfileDraftToSupabase } from "../../features/profile/profileRepository";

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

function DeleteHarness(props: { onDone: (snapshot: { ok: boolean; authStatus: string; hasSession: boolean }) => void }) {
  const { authStatus, session, deleteAccount } = useAppState();
  const startedRef = useRef(false);
  const resultRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated" || startedRef.current) {
      return;
    }
    startedRef.current = true;

    void deleteAccount().then((result) => {
      resultRef.current = result.ok;
    });
  }, [authStatus, deleteAccount]);

  useEffect(() => {
    if (resultRef.current === null || authStatus !== "signed_out") {
      return;
    }

    props.onDone({
      ok: resultRef.current,
      authStatus,
      hasSession: Boolean(session?.user?.id)
    });
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

  it.each(["TOKEN_REFRESHED", "SIGNED_IN", "USER_UPDATED"])("keeps autosaving after same-user %s", async (event) => {
    let currentState: AppStateValue;
    let onAuthChange: (event: string, session: any) => void;
    const session = { user: { id: "user-123", email: "leo@example.com" } };
    mockGetSupabaseClient.mockReturnValue({
      auth: {
        getSession: async () => ({ data: { session } }),
        onAuthStateChange: (callback: typeof onAuthChange) => {
          onAuthChange = callback;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }
      }
    });
    function AutosaveHarness() {
      currentState = useAppState();
      return null;
    }
    render(<AppProvider><AutosaveHarness /></AppProvider>);
    await waitFor(() => {
      expect(currentState.session?.user.id).toBe("user-123");
      expect(currentState.profileHydrationComplete).toBe(true);
    });

    await act(async () => onAuthChange(event, { ...session, access_token: "refreshed" }));
    expect(currentState!.profileHydrationComplete).toBe(true);
    act(() => currentState.updateProfileDraft({ bio: "Edited after refresh" }));
    await waitFor(() => {
      expect(upsertProfileDraftToSupabase).toHaveBeenCalledWith("user-123", expect.objectContaining({ bio: "Edited after refresh" }));
    });
    expect(loadProfileDraftFromSupabase).toHaveBeenCalledTimes(1);

    await act(async () => onAuthChange("SIGNED_IN", { user: { id: "user-456", email: "next@example.com" } }));
    await waitFor(() => {
      expect(loadProfileDraftFromSupabase).toHaveBeenLastCalledWith("user-456");
      expect(currentState.profileHydrationComplete).toBe(true);
    });
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

  it("signs the user out after account deletion succeeds", async () => {
    const onDone = jest.fn();
    const unsubscribe = jest.fn();
    const mockSignOut = jest.fn(async () => ({ error: null }));

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
        })),
        signOut: mockSignOut
      }
    });

    (deleteMyAccountFromSupabase as jest.Mock).mockResolvedValueOnce({ ok: true, deleted: true });

    render(
      <AppProvider>
        <DeleteHarness onDone={onDone} />
      </AppProvider>
    );

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith({ ok: true, authStatus: "signed_out", hasSession: false });
    });

    expect(deleteMyAccountFromSupabase).toHaveBeenCalledWith("user-123");
  });
});
