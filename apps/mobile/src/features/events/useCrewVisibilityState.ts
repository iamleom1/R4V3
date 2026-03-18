import { useCallback, useEffect, useMemo, useState } from "react";
import { listMyCrewVisibility, upsertCrewVisibility } from "./eventRepository";

type CrewVisibilityMap = Record<string, boolean>;
type Listener = (next: CrewVisibilityMap) => void;

const cacheByProfileId = new Map<string, CrewVisibilityMap>();
const listenersByProfileId = new Map<string, Set<Listener>>();
const loadingByProfileId = new Map<string, Promise<CrewVisibilityMap>>();

function getSnapshot(profileId: string | null | undefined): CrewVisibilityMap {
  if (!profileId) return {};
  return cacheByProfileId.get(profileId) ?? {};
}

function emit(profileId: string, next: CrewVisibilityMap) {
  cacheByProfileId.set(profileId, next);
  const listeners = listenersByProfileId.get(profileId);
  if (!listeners) return;
  for (const listener of listeners) listener(next);
}

function subscribe(profileId: string, listener: Listener) {
  const listeners = listenersByProfileId.get(profileId) ?? new Set<Listener>();
  listeners.add(listener);
  listenersByProfileId.set(profileId, listeners);
  return () => {
    const next = listenersByProfileId.get(profileId);
    if (!next) return;
    next.delete(listener);
    if (next.size === 0) listenersByProfileId.delete(profileId);
  };
}

async function loadFromServer(profileId: string, force = false) {
  if (!force && cacheByProfileId.has(profileId)) return cacheByProfileId.get(profileId) ?? {};
  if (!force) {
    const inflight = loadingByProfileId.get(profileId);
    if (inflight) return inflight;
  }
  const req = listMyCrewVisibility(profileId).then((next) => {
    emit(profileId, next);
    loadingByProfileId.delete(profileId);
    return next;
  });
  loadingByProfileId.set(profileId, req);
  return req;
}

export function useCrewVisibilityState(profileId: string | null | undefined) {
  const [visibility, setVisibility] = useState<CrewVisibilityMap>(() => getSnapshot(profileId));
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      setVisibility({});
      return;
    }
    setVisibility(getSnapshot(profileId));
    const unsubscribe = subscribe(profileId, setVisibility);
    void loadFromServer(profileId);
    return unsubscribe;
  }, [profileId]);

  const refreshVisibility = useCallback(async () => {
    if (!profileId) return {} as CrewVisibilityMap;
    setError(null);
    return loadFromServer(profileId, true);
  }, [profileId]);

  const setLooking = useCallback(
    async (eventId: string, isLooking: boolean) => {
      if (!profileId) {
        return { ok: false as const, error: "Sign in required." };
      }
      setError(null);
      setIsSyncing(true);
      const previous = getSnapshot(profileId);
      emit(profileId, { ...previous, [eventId]: isLooking });

      const result = await upsertCrewVisibility(profileId, eventId, isLooking);
      if (!result.ok) {
        emit(profileId, previous);
        setError(result.error);
        setIsSyncing(false);
        return result;
      }

      await loadFromServer(profileId, true);
      setIsSyncing(false);
      return { ok: true as const };
    },
    [profileId]
  );

  return useMemo(
    () => ({ visibility, isSyncing, error, setLooking, refreshVisibility }),
    [error, isSyncing, refreshVisibility, setLooking, visibility]
  );
}
