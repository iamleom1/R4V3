import { listCuratedEvents, setCuratedEventHiddenGlobally } from "./eventCurationRepository";

const mockGetSupabaseClient = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("../../lib/supabase", () => ({
  getSupabaseClient: () => mockGetSupabaseClient()
}));

describe("eventCurationRepository", () => {
  beforeEach(() => {
    mockGetSupabaseClient.mockReset();
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  it("falls back to the legacy curation RPC when paginated curation is unavailable", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "function public.list_curated_events(p_include_past, p_limit, p_offset) does not exist" }
      })
      .mockResolvedValueOnce({
        data: [
          {
            event_id: "event-1",
            title: "Visible Event",
            venue_name: "Venue",
            city: "Los Angeles",
            starts_at: "2026-08-21T05:00:00.000Z",
            ends_at: null,
            genre_tags: ["House"],
            source_primary: "manual",
            is_featured: false,
            promotion_rank: 0,
            featured_until: null,
            curation_note: null,
            flyer_url: null,
            is_hidden: false
          }
        ],
        error: null
      });

    mockGetSupabaseClient.mockReturnValue({ rpc: mockRpc, from: mockFrom });

    const events = await listCuratedEvents(false);

    expect(events).toHaveLength(1);
    expect(mockRpc).toHaveBeenNthCalledWith(1, "list_curated_events", {
      p_include_past: false,
      p_limit: 200,
      p_offset: 0
    });
    expect(mockRpc).toHaveBeenNthCalledWith(2, "list_curated_events", {
      p_include_past: false,
      p_limit: 200
    });
  });

  it.each([true, false])("updates duplicate visibility atomically through the legacy RPC: %s", async (isHidden) => {
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Could not find the function public.moderator_set_event_hidden_globally(p_event_id, p_is_hidden) in the schema cache"
        }
      })
      .mockResolvedValueOnce({
        data: [{ event_id: "event-1" }, { event_id: "event-2" }],
        error: null
      });

    mockGetSupabaseClient.mockReturnValue({ rpc: mockRpc, from: mockFrom });
    const result = await setCuratedEventHiddenGlobally("event-1", isHidden);

    expect(result).toEqual({ ok: true, updatedEventIds: ["event-1", "event-2"] });
    expect(mockRpc).toHaveBeenNthCalledWith(2, "upsert_curated_event", {
      p_event_id: "event-1",
      p_is_hidden: isHidden
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does not fall back after a permission failure", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "moderator_required" } });
    mockGetSupabaseClient.mockReturnValue({ rpc: mockRpc });
    expect(await setCuratedEventHiddenGlobally("event-1", true)).toEqual({
      ok: false, error: "moderator_required"
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("reports a failed legacy visibility update", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: "moderator_set_event_hidden_globally missing from schema cache" } })
      .mockResolvedValueOnce({ data: null, error: { message: "event_not_found" } });
    mockGetSupabaseClient.mockReturnValue({ rpc: mockRpc });
    expect(await setCuratedEventHiddenGlobally("missing", true)).toEqual({
      ok: false, error: "event_not_found"
    });
  });

  it("loads hidden events beyond the first 200 visible events", async () => {
    const rows = Array.from({ length: 201 }, (_row, index) => ({
      event_id: `event-${index}`,
      title: `Event ${index}`,
      starts_at: "2099-01-01T00:00:00Z",
      source_primary: "manual",
      is_hidden: index === 200
    }));
    mockRpc.mockImplementation(async (_name, params) => ({
      data: rows.slice(params.p_offset, params.p_offset + params.p_limit),
      error: null
    }));
    mockGetSupabaseClient.mockReturnValue({ rpc: mockRpc });

    const events = await listCuratedEvents(false);
    expect(events).toHaveLength(201);
    expect(events[200]).toMatchObject({ eventId: "event-200", isHidden: true });
    expect(mockRpc).toHaveBeenNthCalledWith(2, "list_curated_events", {
      p_include_past: false, p_limit: 200, p_offset: 200
    });
  });

  it("returns hidden events from the remote curation list after a persisted hide", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          event_id: "event-1",
          title: "Visible Event",
          venue_name: "Venue",
          city: "Los Angeles",
          starts_at: "2026-08-21T05:00:00.000Z",
          ends_at: null,
          genre_tags: ["House"],
          source_primary: "manual",
          is_featured: false,
          promotion_rank: 0,
          featured_until: null,
          curation_note: null,
          flyer_url: null,
          is_hidden: true
        }
      ],
      error: null
    });

    mockGetSupabaseClient.mockReturnValue({ rpc: mockRpc, from: mockFrom });

    const events = await listCuratedEvents(false);

    expect(events).toEqual([
      expect.objectContaining({
        eventId: "event-1",
        isHidden: true
      })
    ]);
  });
});
