export type MatchMode = "community" | "dating";

export type RSVPStatus = "going" | "none";

export type SwipeDecision = "like" | "pass";

export interface Profile {
  id: string;
  displayName: string;
  bio: string | null;
  age: number | null;
  city: string | null;
  communityModeEnabled: boolean;
  datingModeEnabled: boolean;
  vibeTags: string[];
  musicGenres: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  title: string;
  venueName: string | null;
  city: string | null;
  startsAt: string;
  endsAt?: string | null;
  genreTags?: string[];
  sourcePrimary: "ticketmaster" | "seatgeek" | "manual" | "posh" | "dice";
  isFeatured?: boolean;
  promotionRank?: number;
  featuredUntil?: string | null;
  curationNote?: string | null;
  flyerUrl?: string | null;
  musicPreviewUrl?: string | null;
}
