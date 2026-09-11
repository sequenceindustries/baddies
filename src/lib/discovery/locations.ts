import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT, type CreatorCard } from "@/lib/discovery/creator-card";

/**
 * SEO Phase 5 — a small, hand-maintained set of location landing
 * pages, deliberately NOT a fully dynamic/programmatic "any city"
 * system. `Profile.city`/`Profile.country` are free-text fields, not a
 * controlled taxonomy or enum (confirmed in prisma/schema.prisma) — a
 * creator might type "Johannesburg", "Joburg", "JHB", or "Jozi" for the
 * exact same real city, with nothing enforcing consistency. Building a
 * page per arbitrary string a creator happened to type would risk
 * silently spawning near-duplicate thin pages ("jhb" vs "Johannesburg")
 * with no way to tell search engines they're the same place. This
 * config is the alternative: a short, explicit alias list per real
 * location, matched in application code (see getLocationCreators
 * below) rather than a DB-level filter, since there's no indexable
 * column to filter on in the first place.
 *
 * Adding a 5th city later is a one-line addition here — not a schema
 * change, not a migration — deliberately not pre-built further than
 * what's actually asked for.
 */
export interface LocationConfig {
  slug: string;
  displayName: string;
  // The real bar for "worth indexing" — a page with fewer verified,
  // locationVisible creators than this still renders (a real, honest
  // "new creators coming soon" state, never a 404) but generateMetadata
  // marks it noindex until enough real creators match. No code change
  // needed when a location crosses this line — the next request just
  // computes a fresh count.
  minCreatorsToIndex: number;
  matches: (profile: { city: string | null; country: string | null }) => boolean;
}

function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

const MIN_CREATORS_TO_INDEX = 3;

export const LOCATIONS: LocationConfig[] = [
  {
    slug: "south-africa",
    displayName: "South Africa",
    minCreatorsToIndex: MIN_CREATORS_TO_INDEX,
    matches: (p) => ["south africa", "za", "rsa"].includes(normalize(p.country)),
  },
  {
    slug: "johannesburg",
    displayName: "Johannesburg",
    minCreatorsToIndex: MIN_CREATORS_TO_INDEX,
    matches: (p) => ["johannesburg", "joburg", "jhb", "jozi"].includes(normalize(p.city)),
  },
  {
    slug: "cape-town",
    displayName: "Cape Town",
    minCreatorsToIndex: MIN_CREATORS_TO_INDEX,
    matches: (p) => ["cape town", "capetown", "cpt"].includes(normalize(p.city)),
  },
  {
    slug: "durban",
    displayName: "Durban",
    minCreatorsToIndex: MIN_CREATORS_TO_INDEX,
    matches: (p) => ["durban", "dbn"].includes(normalize(p.city)),
  },
];

export function getLocationConfig(slug: string): LocationConfig | undefined {
  return LOCATIONS.find((location) => location.slug === slug);
}

export interface LocationResult {
  slug: string;
  displayName: string;
  creators: CreatorCard[];
  indexable: boolean;
}

/**
 * Loads every VERIFIED, locationVisible creator once and filters in
 * application code against the slug's alias list — see this module's
 * own doc comment for why there's no DB-level query to run instead.
 * Bounded and cheap at this platform's realistic creator count; if
 * that ever changes, this is the function to revisit, not before.
 * Returns null only for an unconfigured slug (a real 404) — a
 * configured location with zero matches still returns a real,
 * non-indexable result, never null.
 */
export async function getLocationCreators(slug: string): Promise<LocationResult | null> {
  const config = getLocationConfig(slug);
  if (!config) return null;

  const candidates = await db.creatorProfile.findMany({
    where: { status: "VERIFIED", locationVisible: true },
    select: CREATOR_CARD_SELECT,
  });

  const matched = candidates.filter((candidate) =>
    config.matches({
      city: candidate.user.profile?.city ?? null,
      country: candidate.user.profile?.country ?? null,
    })
  );

  const creators = await Promise.all(matched.map((candidate) => toCreatorCard(candidate)));

  return {
    slug: config.slug,
    displayName: config.displayName,
    creators,
    indexable: creators.length >= config.minCreatorsToIndex,
  };
}
