import { listMessages } from "../messagesRepository";
const mockGetSupabaseClient = jest.fn();
jest.mock("../../../lib/supabase", () => ({ getSupabaseClient: () => mockGetSupabaseClient() }));
jest.mock("../../../lib/telemetry", () => ({ trackEvent: jest.fn() }));
jest.mock("../../profile/photoRepository", () => ({ listPrimaryProfilePhotoUrls: jest.fn() }));

test("loads the newest bounded page with a stable cursor, returning chronological messages", async () => {
  const query: any = {};
  for (const method of ["select", "eq", "is", "order", "limit", "or"]) query[method] = jest.fn(() => query);
  query.then = (resolve: any) => Promise.resolve({ data: [
    { id: "b", created_at: "2026-01-01", body: "newer" },
    { id: "a", created_at: "2026-01-01", body: "older" }
  ], error: null }).then(resolve);
  mockGetSupabaseClient.mockReturnValue({ from: () => query });
  const cursor = { id: "c", createdAt: "2026-01-01T00:00:00Z" };
  const messages = await listMessages("match", "viewer", cursor);
  expect(query.order.mock.calls).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
  expect(query.limit).toHaveBeenCalledWith(50);
  expect(query.or).toHaveBeenCalledWith("created_at.lt.2026-01-01T00:00:00Z,and(created_at.eq.2026-01-01T00:00:00Z,id.lt.c)");
  expect(messages.map((message) => message.id)).toEqual(["a", "b"]);
});
