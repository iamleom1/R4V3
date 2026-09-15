import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useMessageHistory } from "../useMessageHistory";

const row = (id: string) => ({ id, createdAt: `2026-01-01T00:00:${id.padStart(2, "0")}Z` });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("a delayed snapshot preserves realtime arrivals and deduplicates sent messages", async () => {
  const pending = deferred<ReturnType<typeof row>[]>();
  const { result } = renderHook(() => useMessageHistory("a", () => pending.promise));
  act(() => { result.current.append(row("2")); });
  await act(async () => pending.resolve([row("1"), row("2")]));
  expect(result.current.messages.map((item) => item.id)).toEqual(["1", "2"]);
});

test("ignores responses belonging to a previous account or conversation", async () => {
  const old = deferred<ReturnType<typeof row>[]>();
  const current = deferred<ReturnType<typeof row>[]>();
  let id = "a";
  const { result, rerender } = renderHook(() => useMessageHistory(id, () => id === "a" ? old.promise : current.promise));
  id = "b";
  rerender(undefined);
  await act(async () => current.resolve([row("2")]));
  await act(async () => old.resolve([row("1")]));
  expect(result.current.messages).toEqual([row("2")]);
});

test("does not overlap refreshes and removes messages missing from a fresh complete snapshot", async () => {
  const fetch = jest.fn().mockResolvedValueOnce([row("1"), row("2")]);
  const { result } = renderHook(() => useMessageHistory("a", fetch));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  const pending = deferred<ReturnType<typeof row>[]>();
  fetch.mockReturnValue(pending.promise);
  act(() => { void result.current.refresh(); void result.current.refresh(); });
  expect(fetch).toHaveBeenCalledTimes(2);
  act(() => result.current.append(row("3")));
  await act(async () => pending.resolve([row("2")]));
  expect(result.current.messages).toEqual([row("2"), row("3")]);
});

test("uses the oldest fetched row as the next page cursor", async () => {
  const page = Array.from({ length: 50 }, (_, index) => row(String(index + 10)));
  const fetch = jest.fn().mockResolvedValueOnce(page).mockResolvedValueOnce([row("1")]);
  const { result } = renderHook(() => useMessageHistory("a", fetch));
  await waitFor(() => expect(result.current.hasOlder).toBe(true));
  await act(async () => { await result.current.loadOlder(); });
  expect(fetch).toHaveBeenLastCalledWith(page[0]);
  expect(result.current.messages).toHaveLength(51);
  expect(result.current.hasOlder).toBe(false);
});
