import { useCallback, useEffect, useRef, useState } from "react";

export type HistoryMessage = { id: string; createdAt: string };
export type HistoryCursor = Pick<HistoryMessage, "id" | "createdAt">;
export const MESSAGE_PAGE_SIZE = 50;

export function mergeMessages<T extends HistoryMessage>(current: T[], incoming: T[]): T[] {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function useMessageHistory<T extends HistoryMessage>(
  key: string,
  fetchPage: (before?: HistoryCursor) => Promise<T[]>
) {
  const [messages, setMessages] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const generation = useRef(0);
  const busy = useRef(false);
  const arrivals = useRef(new Map<string, number>());
  const revision = useRef(0);
  const cursor = useRef<HistoryCursor | undefined>(undefined);

  const load = useCallback(async (older = false, silent = false) => {
    if (busy.current) return;
    busy.current = true;
    const epoch = generation.current;
    const startedAt = revision.current;
    if (older) setIsLoadingOlder(true);
    else if (!silent) setIsRefreshing(true);
    if (!silent) setError(null);
    try {
      const rows = await fetchRef.current(older ? cursor.current : undefined);
      if (epoch !== generation.current) return;
      setMessages((previous) => {
        if (older) return mergeMessages(previous, rows);
        // Preserve older pages and arrivals received while this snapshot was loading.
        const oldest = rows[0];
        const retained = previous.filter((row) =>
          (arrivals.current.get(row.id) ?? 0) > startedAt ||
          (rows.length === MESSAGE_PAGE_SIZE && oldest &&
            (row.createdAt < oldest.createdAt || (row.createdAt === oldest.createdAt && row.id < oldest.id)))
        );
        return mergeMessages(retained, rows);
      });
      if (older || !cursor.current) {
        cursor.current = rows[0] ?? cursor.current;
        setHasOlder(rows.length === MESSAGE_PAGE_SIZE);
      }
    } catch (e) {
      if (epoch === generation.current && !silent) setError(e);
    } finally {
      if (epoch === generation.current) {
        busy.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingOlder(false);
      }
    }
  }, []);

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    cursor.current = undefined;
    arrivals.current.clear();
    setMessages([]);
    setHasOlder(false);
    setIsLoading(true);
    setIsLoadingOlder(false);
    void load();
    return () => { generation.current += 1; };
  }, [key, load]);

  const append = useCallback((message: T) => {
    arrivals.current.set(message.id, ++revision.current);
    setMessages((previous) => mergeMessages(previous, [message]));
  }, []);

  return { messages, append, isLoading, isRefreshing, isLoadingOlder, hasOlder, error,
    refresh: (silent = false) => load(false, silent), loadOlder: () => load(true) };
}
