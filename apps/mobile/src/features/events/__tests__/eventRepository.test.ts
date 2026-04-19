import { listUpcomingEvents } from "../eventRepository";

const mockGetSupabaseClient = jest.fn();

jest.mock("../../../lib/supabase", () => ({
  getSupabaseClient: () => mockGetSupabaseClient()
}));

jest.mock("../../../lib/env", () => ({
  env: {},
  hasTicketmasterEnv: () => false
}));

jest.mock("../../../lib/telemetry", () => ({
  trackEvent: jest.fn()
}));

jest.mock("../../profile/photoRepository", () => ({
  listPrimaryProfilePhotoUrls: jest.fn(async () => ({}))
}));

type EventRow = {
  id: string;
  title: string;
  venue_name: string | null;
  city: string | null;
  starts_at: string;
  ends_at: string | null;
  genre_tags: string[] | null;
  source_primary: "manual" | "posh" | "dice";
  is_featured: boolean;
  promotion_rank: number;
  featured_until: string | null;
  curation_note: string | null;
  flyer_url: string | null;
  music_preview_url: string | null;
};

function createEventsClient(rows: EventRow[]) {
  return {
    from: () => ({
      select() {
        return this;
      },
      gte() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      range(from: number, to: number) {
        return Promise.resolve({
          data: rows.slice(from, to + 1),
          error: null
        });
      }
    })
  };
}

describe("listUpcomingEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("dedupes matching Posh and DICE events into a single feed item", async () => {
    mockGetSupabaseClient.mockReturnValue(
      createEventsClient([
        {
          id: "posh-1",
          title: "Sara Landry: All Night Long",
          venue_name: "The Torch LA",
          city: "Los Angeles",
          starts_at: "2026-05-12T05:00:00.000Z",
          ends_at: null,
          genre_tags: ["Techno"],
          source_primary: "posh",
          is_featured: false,
          promotion_rank: 1,
          featured_until: null,
          curation_note: null,
          flyer_url: null,
          music_preview_url: null
        },
        {
          id: "dice-1",
          title: "SARA LANDRY ALL NIGHT LONG",
          venue_name: "Torch",
          city: "Los Angeles",
          starts_at: "2026-05-12T06:00:00.000Z",
          ends_at: null,
          genre_tags: ["Hard Techno", "Techno"],
          source_primary: "dice",
          is_featured: true,
          promotion_rank: 5,
          featured_until: null,
          curation_note: "Staff pick",
          flyer_url: "https://example.com/flyer.jpg",
          music_preview_url: null
        },
        {
          id: "manual-1",
          title: "Warehouse Pulse",
          venue_name: "District 9",
          city: "Los Angeles",
          starts_at: "2026-05-15T05:00:00.000Z",
          ends_at: null,
          genre_tags: ["House"],
          source_primary: "manual",
          is_featured: false,
          promotion_rank: 0,
          featured_until: null,
          curation_note: null,
          flyer_url: null,
          music_preview_url: null
        }
      ])
    );

    const events = await listUpcomingEvents(null);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: "dice-1",
      title: "SARA LANDRY ALL NIGHT LONG",
      flyerUrl: "https://example.com/flyer.jpg",
      curationNote: "Staff pick"
    });
    expect(events[0].genreTags).toEqual(expect.arrayContaining(["Techno", "Hard Techno"]));
  });
});
