import { useCallback, useEffect, useMemo, useState } from "react";
import type { RSVPStatus } from "../../types/domain";
import { listMyEventRsvps, upsertEventRsvp } from "./eventRepository";

type RsvpMap = Record<string, RSVPStatus>;
type Listener = (next: RsvpMap) => void;

const rsvpCacheByProfileId = new Map<string, RsvpMap>();
const listenersByProfileId = new Map<string, Set<Listener>>();
const loadingByProfileId = new Map<string, Promise<RsvpMap>>();

function getRsvpSnapshot(profileId: string | null | undefined): RsvpMap {
  if (!profileId) return {};
  return rsvpCacheByProfileId.get(profileId) ?? {};
}

function emit(profileId: string, next: RsvpMap) {
  rsvpCacheByProfileId.set(profileId, next);
  const listeners = listenersByProfileId.get(profileId);
  if (!listeners) return;
  for (const listener of listeners) {
    listener(next);
  }
}

function subscribe(profileId: string, listener: Listener) {
  const current = listenersByProfileId.get(profileId) ?? new Set<Listener>();
  current.add(listener);
  listenersByProfileId.set(profileId, current);
  return () => {
    const next = listenersByProfileId.get(profileId);
    if (!next) return;
    next.delete(listener);
    if (next.size === 0) {
      listenersByProfileId.delete(profileId);
    }
  };
}

async function loadFromServer(profileId: string, force = false) {
  if (!force && rsvpCacheByProfileId.has(profileId)) {
    return rsvpCacheByProfileId.get(profileId) ?? {};
  }
  if (!force) {
    const inFlight = loadingByProfileId.get(profileId);
    if (inFlight) return inFlight;
  }
  const req = listMyEventRsvps(profileId).then((next) => {
    emit(profileId, next);
    loadingByProfileId.delete(profileId);
    return next;
  });
  loadingByProfileId.set(profileId, req);
  return req;
}

export function useEventRsvpState(profileId: string | null | undefined) {
  const [rsvps, setRsvps] = useState<RsvpMap>(() => getRsvpSnapshot(profileId));
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      setRsvps({});
      return;
    }
    setRsvps(getRsvpSnapshot(profileId));
    const unsub = subscribe(profileId, setRsvps);
    void loadFromServer(profileId, false);
    return unsub;
  }, [profileId]);

  const refreshRsvps = useCallback(async () => {
    if (!profileId) return {} as RsvpMap;
    setError(null);
    const next = await loadFromServer(profileId, true);
    return next;
  }, [profileId]);

  const setRsvp = useCallback(
    async (eventId: string, status: RSVPStatus) => {
      if (!profileId) {
        return { ok: false as const, error: "Sign in required." };
      }

      setError(null);
      setIsSyncing(true);
      const previous = getRsvpSnapshot(profileId);
      const optimistic = { ...previous, [eventId]: status };
      emit(profileId, optimistic);

      const result = await upsertEventRsvp(profileId, eventId, status);
      if (!result.ok) {
        emit(profileId, previous);
        setError(result.error);
        setIsSyncing(false);
        return result;
      }

      // Invalidate/refresh global RSVP cache after write so all subscribers stay coherent.
      await loadFromServer(profileId, true);
      setIsSyncing(false);
      return { ok: true as const };
    },
    [profileId]
  );

  return useMemo(
    () => ({ rsvps, isSyncing, error, setRsvp, refreshRsvps }),
    [error, isSyncing, refreshRsvps, rsvps, setRsvp]
  );
}

