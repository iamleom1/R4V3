import { getSupabaseClient } from "../../lib/supabase";

export type CuratedEvent = {
  eventId: string;
  title: string;
  venueName: string | null;
  city: string | null;
  startsAt: string;
  endsAt: string | null;
  genreTags: string[];
  sourcePrimary: "ticketmaster" | "seatgeek" | "manual" | "posh" | "dice";
  isFeatured: boolean;
  promotionRank: number;
  featuredUntil: string | null;
  curationNote: string | null;
  flyerUrl: string | null;
  isHidden: boolean;
};

type CuratedEventRow = {
  event_id: string;
  title: string;
  venue_name: string | null;
  city: string | null;
  starts_at: string;
  ends_at: string | null;
  genre_tags: string[] | null;
  source_primary: CuratedEvent["sourcePrimary"];
  is_featured: boolean;
  promotion_rank: number;
  featured_until: string | null;
  curation_note: string | null;
  flyer_url: string | null;
  is_hidden: boolean;
};

export async function listCuratedEvents(includePast = false) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await (supabase.rpc as any)("list_curated_events", {
    p_include_past: includePast,
    p_limit: 100
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return (data as CuratedEventRow[]).map((row) => ({
    eventId: row.event_id,
    title: row.title,
    venueName: row.venue_name,
    city: row.city,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    genreTags: row.genre_tags ?? [],
    sourcePrimary: row.source_primary,
    isFeatured: row.is_featured,
    promotionRank: Number(row.promotion_rank ?? 0),
    featuredUntil: row.featured_until,
    curationNote: row.curation_note,
    flyerUrl: row.flyer_url,
    isHidden: Boolean(row.is_hidden)
  }));
}

export async function upsertCuratedEvent(input: {
  eventId?: string | null;
  title: string;
  venueName?: string | null;
  city?: string | null;
  startsAt: string;
  endsAt?: string | null;
  genreTags: string[];
  sourcePrimary?: CuratedEvent["sourcePrimary"];
  isFeatured: boolean;
  promotionRank: number;
  featuredUntil?: string | null;
  curationNote?: string | null;
  flyerUrl?: string | null;
  isHidden?: boolean;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { data, error } = await (supabase.rpc as any)("upsert_curated_event", {
    p_event_id: input.eventId ?? null,
    p_title: input.title,
    p_venue_name: input.venueName ?? null,
    p_city: input.city ?? null,
    p_region: "CA",
    p_country: "US",
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt ?? null,
    p_genre_tags: input.genreTags,
    p_source_primary: input.sourcePrimary ?? "manual",
    p_is_featured: input.isFeatured,
    p_promotion_rank: input.promotionRank,
    p_featured_until: input.featuredUntil ?? null,
    p_curation_note: input.curationNote ?? null,
    p_flyer_url: input.flyerUrl ?? null,
    p_is_hidden: input.isHidden ?? false
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    const message = error?.message ?? "Failed to save curated event.";
    const duplicateEventId = typeof message === "string" && message.startsWith("duplicate_event:")
      ? message.split(":")[1] ?? null
      : null;
    return { ok: false as const, error: message, duplicateEventId };
  }

  return { ok: true as const, eventId: row.event_id as string };
}
