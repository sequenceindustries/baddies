import { PrismaClient } from "@prisma/client";
import { DEFAULT_BUSINESS_CONFIG } from "../src/lib/config/business";
import { AGREEMENTS } from "./agreements";
import { REVENUE_SHARE_RULES } from "./revenue-rules";
import { hashPassword } from "../src/lib/auth/session";
import { encryptField } from "../src/lib/security/field-encryption";

const db = new PrismaClient();

// Small, deliberately flat starter set — admins can add more via the
// (future) admin category management UI. Not meant to be exhaustive.
const STARTER_CATEGORIES = [
  { slug: "south-african", name: "South African" },
  { slug: "new-baddies", name: "New Baddies" },
  { slug: "cosplay", name: "Cosplay" },
  { slug: "fitness", name: "Fitness" },
];

// Same fixed password for every dummy account — these exist purely to
// populate the platform with something to look at (landing page, search,
// a real creator profile timeline) on a fresh environment. Never used for
// anything real; the email domain flags that too.
const DUMMY_PASSWORD = "BaddiesDemo123!";

interface DummyPost {
  tier: "FREE" | "VIP" | "VVIP";
  caption: string;
  daysAgo: number;
  // Unsplash photo id (the part after "photo-" in images.unsplash.com/photo-<id>).
  // Every id here was hand-checked to contain no people — see the seed
  // script's comment on fetchPhotoBytes for why that matters.
  photoId: string;
}

interface DummyCreatorSpec {
  slug: string; // stable prefix for deterministic seed IDs — safe to re-run
  email: string;
  displayName: string;
  legalName: string;
  bio: string;
  country: string;
  city: string;
  vvipPriceUsd: string;
  colorA: string;
  colorB: string;
  // Same no-people rule as post photos (see fetchPhotoBytes) — a real
  // photo crop reads as an actual profile picture rather than a plain
  // initial-on-a-gradient placeholder, without depicting anyone.
  avatarPhotoId: string;
  // CreatorProfile.coverImageUrl — what shows on Top Baddies, Baddies
  // Near You, etc. (see src/lib/discovery/creator-card.ts). Same
  // no-people rule as every other seed photo; a real creator sets their
  // own via /apply or the Dashboard's Content tab (ImageUploadField),
  // this is just the seed data's stand-in for that.
  featuredPhotoId: string;
  posts: DummyPost[];
}

const DUMMY_CREATORS: DummyCreatorSpec[] = [
  {
    slug: "seed-thandeka",
    email: "thandeka@dummy.baddies.local",
    displayName: "Thandeka",
    legalName: "Dummy Seed Account — Thandeka",
    bio: "Cape Town born and raised. Golden hour on the promenade, always. New here — say hi.",
    country: "South Africa",
    city: "Cape Town",
    vvipPriceUsd: "7.99",
    colorA: "#c9a961",
    colorB: "#0e0e11",
    avatarPhotoId: "1506905925346-21bda4d32df4",
    featuredPhotoId: "1500375592092-40eb2168fd21",
    posts: [
      { tier: "FREE", caption: "Table Mountain never gets old", daysAgo: 9, photoId: "1506905925346-21bda4d32df4" },
      { tier: "FREE", caption: "Sunday market run, Bo-Kaap edition.", daysAgo: 4, photoId: "1490750967868-88aa4486c946" },
      { tier: "VIP", caption: "Studio session behind the scenes — VIP only", daysAgo: 6, photoId: "1519681393784-d120267933ba" },
      { tier: "VIP", caption: "A little preview from this week's shoot.", daysAgo: 2, photoId: "1500375592092-40eb2168fd21" },
      { tier: "VVIP", caption: "For my Exclusive baddies only", daysAgo: 5, photoId: "1533105079780-92b9be482077" },
      { tier: "VVIP", caption: "Full set just dropped for subscribers.", daysAgo: 1, photoId: "1483729558449-99ef09a8c325" },
    ],
  },
  {
    slug: "seed-amara",
    email: "amara@dummy.baddies.local",
    displayName: "Amara",
    legalName: "Dummy Seed Account — Amara",
    bio: "Joburg energy, always. Fitness, fashion, and everything in between. Verified Baddie.",
    country: "South Africa",
    city: "Johannesburg",
    vvipPriceUsd: "12.99",
    colorA: "#7c2d3b",
    colorB: "#1e1e25",
    avatarPhotoId: "1449824913935-59a10b8d2000",
    featuredPhotoId: "1465447142348-e9952c393450",
    posts: [
      { tier: "FREE", caption: "Morning run before the city wakes up.", daysAgo: 8, photoId: "1449824913935-59a10b8d2000" },
      { tier: "FREE", caption: "New look, who dis?", daysAgo: 3, photoId: "1441986300917-64674bd600d8" },
      { tier: "VIP", caption: "VIP pass holders get this whole gallery.", daysAgo: 7, photoId: "1465447142348-e9952c393450" },
      { tier: "VIP", caption: "Gym look of the week.", daysAgo: 2, photoId: "1490645935967-10de6ba17061" },
      { tier: "VVIP", caption: "Subscribers only — the real behind the scenes.", daysAgo: 4, photoId: "1508739773434-c26b3d09e071" },
      { tier: "VVIP", caption: "Thank you for 1k subscribers", daysAgo: 1, photoId: "1487958449943-2429e8be8625" },
    ],
  },
  {
    slug: "seed-zoe",
    email: "zoe@dummy.baddies.local",
    displayName: "Zoe",
    legalName: "Dummy Seed Account — Zoe",
    bio: "London based, South African at heart. Global Baddie, local roots. New account, big plans.",
    country: "United Kingdom",
    city: "London",
    vvipPriceUsd: "9.99",
    colorA: "#4c5faf",
    colorB: "#0e0e11",
    avatarPhotoId: "1477959858617-67f85cf4f1df",
    featuredPhotoId: "1470071459604-3b5ec3a7fe05",
    posts: [
      { tier: "FREE", caption: "Golden hour by the Thames.", daysAgo: 10, photoId: "1477959858617-67f85cf4f1df" },
      { tier: "FREE", caption: "First post here — thanks for the follows!", daysAgo: 5, photoId: "1441974231531-c6227db76b6e" },
      { tier: "VIP", caption: "VIP-tier drop for everyone with the pass.", daysAgo: 6, photoId: "1470071459604-3b5ec3a7fe05" },
      { tier: "VIP", caption: "Behind the scenes from today's shoot.", daysAgo: 3, photoId: "1520250497591-112f2f40a3f4" },
      { tier: "VVIP", caption: "Exclusive content — subscribers see it first.", daysAgo: 4, photoId: "1519046904884-53103b34b206" },
      { tier: "VVIP", caption: "This week's full exclusive set is up.", daysAgo: 1, photoId: "1506905925346-21bda4d32df4" },
    ],
  },
  {
    slug: "seed-lerato",
    email: "lerato@dummy.baddies.local",
    displayName: "Lerato",
    legalName: "Dummy Seed Account — Lerato",
    bio: "Durban humidity, beachfront sunrises. Surf, sun, and content drops every week.",
    country: "South Africa",
    city: "Durban",
    vvipPriceUsd: "8.99",
    colorA: "#1f7a8c",
    colorB: "#0e0e11",
    avatarPhotoId: "1490645935967-10de6ba17061",
    featuredPhotoId: "1519046904884-53103b34b206",
    posts: [
      { tier: "FREE", caption: "Beachfront walk this morning.", daysAgo: 11, photoId: "1490645935967-10de6ba17061" },
      { tier: "FREE", caption: "Durban never disappoints.", daysAgo: 6, photoId: "1477959858617-67f85cf4f1df" },
      { tier: "VIP", caption: "VIP pass holders — new drop is up.", daysAgo: 7, photoId: "1519046904884-53103b34b206" },
      { tier: "VIP", caption: "Studio day, VIP eyes only.", daysAgo: 3, photoId: "1533105079780-92b9be482077" },
      { tier: "VVIP", caption: "Full gallery for my Exclusive subscribers.", daysAgo: 5, photoId: "1487958449943-2429e8be8625" },
      { tier: "VVIP", caption: "Subscribers get this set first.", daysAgo: 2, photoId: "1508739773434-c26b3d09e071" },
    ],
  },
  {
    slug: "seed-naledi",
    email: "naledi@dummy.baddies.local",
    displayName: "Naledi",
    legalName: "Dummy Seed Account — Naledi",
    bio: "Pretoria based. Jacaranda season is my favourite season. New here, be kind.",
    country: "South Africa",
    city: "Pretoria",
    vvipPriceUsd: "10.99",
    colorA: "#6a4c93",
    colorB: "#1e1e25",
    avatarPhotoId: "1441986300917-64674bd600d8",
    featuredPhotoId: "1490750967868-88aa4486c946",
    posts: [
      { tier: "FREE", caption: "Jacaranda season in Pretoria.", daysAgo: 12, photoId: "1441986300917-64674bd600d8" },
      { tier: "FREE", caption: "Market day finds.", daysAgo: 7, photoId: "1490750967868-88aa4486c946" },
      { tier: "VIP", caption: "VIP-tier gallery just dropped.", daysAgo: 8, photoId: "1465447142348-e9952c393450" },
      { tier: "VIP", caption: "Behind the scenes, VIP only.", daysAgo: 4, photoId: "1500375592092-40eb2168fd21" },
      { tier: "VVIP", caption: "For my Exclusive baddies — new set.", daysAgo: 6, photoId: "1483729558449-99ef09a8c325" },
      { tier: "VVIP", caption: "Thank you for subscribing — this one's for you.", daysAgo: 2, photoId: "1520250497591-112f2f40a3f4" },
    ],
  },
  {
    slug: "seed-priya",
    email: "priya@dummy.baddies.local",
    displayName: "Priya",
    legalName: "Dummy Seed Account — Priya",
    bio: "South African, Manchester based. Building my page from scratch — thanks for the support.",
    country: "United Kingdom",
    city: "Manchester",
    vvipPriceUsd: "11.99",
    colorA: "#b5482e",
    colorB: "#0e0e11",
    avatarPhotoId: "1519681393784-d120267933ba",
    featuredPhotoId: "1441974231531-c6227db76b6e",
    posts: [
      { tier: "FREE", caption: "Manchester in the golden hour.", daysAgo: 13, photoId: "1519681393784-d120267933ba" },
      { tier: "FREE", caption: "New account, first proper post!", daysAgo: 8, photoId: "1441974231531-c6227db76b6e" },
      { tier: "VIP", caption: "VIP-tier content, fresh drop.", daysAgo: 9, photoId: "1487958449943-2429e8be8625" },
      { tier: "VIP", caption: "This week's VIP gallery.", daysAgo: 5, photoId: "1508739773434-c26b3d09e071" },
      { tier: "VVIP", caption: "Exclusive subscribers see this first.", daysAgo: 6, photoId: "1533105079780-92b9be482077" },
      { tier: "VVIP", caption: "Full set for my Exclusive baddies.", daysAgo: 1, photoId: "1483729558449-99ef09a8c325" },
    ],
  },
  {
    slug: "seed-kea",
    email: "kea@dummy.baddies.local",
    displayName: "Kea",
    legalName: "Dummy Seed Account — Kea",
    bio: "Gqeberha born. Ocean views, good coffee, better content. Verified Baddie.",
    country: "South Africa",
    city: "Gqeberha",
    vvipPriceUsd: "6.99",
    colorA: "#2f6f4f",
    colorB: "#0e0e11",
    avatarPhotoId: "1470071459604-3b5ec3a7fe05",
    featuredPhotoId: "1449824913935-59a10b8d2000",
    posts: [
      { tier: "FREE", caption: "Ocean views from home.", daysAgo: 14, photoId: "1470071459604-3b5ec3a7fe05" },
      { tier: "FREE", caption: "Coffee run, good vibes.", daysAgo: 9, photoId: "1449824913935-59a10b8d2000" },
      { tier: "VIP", caption: "VIP gallery — fresh for the week.", daysAgo: 10, photoId: "1490645935967-10de6ba17061" },
      { tier: "VIP", caption: "Behind the scenes, VIP eyes only.", daysAgo: 4, photoId: "1465447142348-e9952c393450" },
      { tier: "VVIP", caption: "New set for my Exclusive subscribers.", daysAgo: 7, photoId: "1519046904884-53103b34b206" },
      { tier: "VVIP", caption: "Exclusive drop — thank you for the support.", daysAgo: 2, photoId: "1500375592092-40eb2168fd21" },
    ],
  },
  {
    slug: "seed-mia",
    email: "mia@dummy.baddies.local",
    displayName: "Mia",
    legalName: "Dummy Seed Account — Mia",
    bio: "South African in New York. Big city, small-town roots. New page, big plans.",
    country: "United States",
    city: "New York",
    vvipPriceUsd: "13.99",
    colorA: "#9c6b30",
    colorB: "#1e1e25",
    avatarPhotoId: "1520250497591-112f2f40a3f4",
    featuredPhotoId: "1533105079780-92b9be482077",
    posts: [
      { tier: "FREE", caption: "New York, first week here.", daysAgo: 15, photoId: "1520250497591-112f2f40a3f4" },
      { tier: "FREE", caption: "City views never get old.", daysAgo: 10, photoId: "1519681393784-d120267933ba" },
      { tier: "VIP", caption: "VIP-tier drop, fresh from the shoot.", daysAgo: 11, photoId: "1508739773434-c26b3d09e071" },
      { tier: "VIP", caption: "This week's VIP-only gallery.", daysAgo: 5, photoId: "1487958449943-2429e8be8625" },
      { tier: "VVIP", caption: "Full Exclusive set — subscribers first.", daysAgo: 8, photoId: "1483729558449-99ef09a8c325" },
      { tier: "VVIP", caption: "Thank you for 500 subscribers!", daysAgo: 3, photoId: "1506905925346-21bda4d32df4" },
    ],
  },
];

/** Gradient-with-initial fallback avatar — only used if the real photo fetch fails, so seeding never hard-fails over a decorative image. */
function fallbackAvatarDataUri(initial: string, colorA: string, colorB: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colorA}"/>
        <stop offset="1" stop-color="${colorB}"/>
      </linearGradient>
    </defs>
    <circle cx="100" cy="100" r="100" fill="url(#g)"/>
    <text x="100" y="128" font-family="Georgia, serif" font-size="88" font-weight="600" fill="#f1eee7" text-anchor="middle">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * A real photo crop — same kind of people-free photography used for
 * posts (see fetchPhotoBytes's comment; the rule applies identically
 * here), rather than a plain initial on a gradient. Used for both
 * Profile.avatarUrl (square) and CreatorProfile.coverImageUrl (the
 * "featured image" shown on discovery cards, cropped closer to
 * CreatorCard's own 4:5) — both are plain string fields, so this is
 * stored directly as a data: URI, no storage provider involved.
 */
async function fetchImageDataUri(
  photoId: string,
  width: number,
  height: number,
  initial: string,
  colorA: string,
  colorB: string
): Promise<string> {
  try {
    const res = await fetch(`https://images.unsplash.com/photo-${photoId}?w=${width}&h=${height}&fit=crop&q=80`);
    if (!res.ok) throw new Error(`Unsplash returned ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch (err) {
    console.warn(`  (couldn't fetch photo ${photoId}, using gradient fallback: ${(err as Error).message})`);
    return fallbackAvatarDataUri(initial, colorA, colorB);
  }
}

/** Gradient fallback — only used if fetchPhotoBytes can't reach the network at seed time, so seeding never hard-fails on a flaky connection. */
function fallbackSvgBytes(label: string, tierLabel: string, colorA: string, colorB: string): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colorA}"/>
        <stop offset="1" stop-color="${colorB}"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="750" fill="url(#g)"/>
    <circle cx="1040" cy="120" r="220" fill="#ffffff" opacity="0.06"/>
    <circle cx="120" cy="660" r="260" fill="#ffffff" opacity="0.05"/>
    <text x="60" y="660" font-family="Georgia, serif" font-size="64" font-weight="600" fill="#f1eee7" opacity="0.92">${label}</text>
    <text x="60" y="705" font-family="Helvetica, Arial, sans-serif" font-size="28" letter-spacing="2" fill="#f1eee7" opacity="0.7">${tierLabel.toUpperCase()}</text>
  </svg>`;
  return Buffer.from(svg, "utf8");
}

/**
 * Real photography for seed "post" content, fetched from Unsplash at seed
 * time and stored as bytes (same as any upload — see the MediaBlob write
 * below). Every photoId used by DUMMY_CREATORS was individually reviewed
 * before being added here and contains no people at all — not faces, not
 * bodies, not even a distant/blurry figure. That's a deliberate, simple
 * bright line for this platform rather than a judgment call about
 * "identifiable": Baddies never fabricates or sources a depiction of a
 * real or fake person for seed data, full stop. These are landscapes,
 * cityscapes, and lifestyle objects only.
 *
 * Falls back to the gradient placeholder if the fetch fails for any
 * reason (offline dev environment, Unsplash unreachable) — seeding must
 * never hard-fail over a decorative image.
 */
async function fetchPhotoBytes(
  photoId: string,
  label: string,
  tierLabel: string,
  colorA: string,
  colorB: string
): Promise<{ bytes: Buffer; mimeType: string }> {
  try {
    const res = await fetch(`https://images.unsplash.com/photo-${photoId}?w=1200&h=750&fit=crop&q=80`);
    if (!res.ok) throw new Error(`Unsplash returned ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, mimeType: "image/jpeg" };
  } catch (err) {
    console.warn(`  (couldn't fetch photo ${photoId}, using gradient fallback: ${(err as Error).message})`);
    return { bytes: fallbackSvgBytes(label, tierLabel, colorA, colorB), mimeType: "image/svg+xml" };
  }
}

async function seedDummyCreators() {
  console.log("Seeding dummy creator accounts...");

  for (const spec of DUMMY_CREATORS) {
    const passwordHash = await hashPassword(DUMMY_PASSWORD);
    const legalNameEncrypted = encryptField(spec.legalName);
    const initial = spec.displayName.charAt(0).toUpperCase();
    const [avatarUrl, coverImageUrl] = await Promise.all([
      fetchImageDataUri(spec.avatarPhotoId, 240, 240, initial, spec.colorA, spec.colorB),
      fetchImageDataUri(spec.featuredPhotoId, 640, 800, initial, spec.colorA, spec.colorB),
    ]);

    const user = await db.user.upsert({
      where: { email: spec.email },
      create: { email: spec.email, passwordHash, role: "CREATOR" },
      update: {},
    });

    await db.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName: spec.displayName,
        bio: spec.bio,
        avatarUrl,
        country: spec.country,
        city: spec.city,
      },
      update: { displayName: spec.displayName, bio: spec.bio, avatarUrl, country: spec.country, city: spec.city },
    });

    await db.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    const approvedAt = new Date(Date.now() - spec.posts.length * 24 * 60 * 60 * 1000);
    const creatorProfile = await db.creatorProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: "VERIFIED",
        legalNameEncrypted,
        vvipPriceOverride: spec.vvipPriceUsd,
        unlimitedOptedIn: true,
        subscriberCountVisible: true,
        locationVisible: true,
        appliedAt: approvedAt,
        approvedAt,
        coverImageUrl,
      },
      update: {
        status: "VERIFIED",
        vvipPriceOverride: spec.vvipPriceUsd,
        unlimitedOptedIn: true,
        subscriberCountVisible: true,
        locationVisible: true,
        coverImageUrl,
      },
    });

    for (const [i, post] of spec.posts.entries()) {
      const contentId = `${spec.slug}-post-${i + 1}`;
      const publishedAt = new Date(Date.now() - post.daysAgo * 24 * 60 * 60 * 1000);
      const storageKey = `creators/${creatorProfile.id}/content/${contentId}`;
      const { bytes, mimeType } = await fetchPhotoBytes(
        post.photoId,
        spec.displayName,
        post.tier === "VVIP" ? "Exclusive" : post.tier,
        spec.colorA,
        spec.colorB
      );

      await db.content.upsert({
        where: { id: contentId },
        create: {
          id: contentId,
          creatorProfileId: creatorProfile.id,
          mediaType: "IMAGE",
          accessLevel: post.tier,
          caption: post.caption,
          status: "APPROVED",
          moderationStatus: "APPROVED",
          publishedAt,
          createdAt: publishedAt,
        },
        update: { caption: post.caption, accessLevel: post.tier, publishedAt },
      });

      await db.mediaAsset.upsert({
        where: { id: `${contentId}-asset` },
        create: {
          id: `${contentId}-asset`,
          contentId,
          storageProvider: "stub",
          storageKey,
          mimeType,
          byteSize: bytes.byteLength,
        },
        update: { mimeType, byteSize: bytes.byteLength },
      });

      // Mirrors what StubMediaStorageProvider.putObject does — writing
      // directly here (rather than going through the provider) keeps this
      // script decoupled from which provider is configured, and seeding
      // only ever targets the stub provider's backing table anyway.
      await db.mediaBlob.upsert({
        where: { storageKey },
        create: { storageKey, mimeType, bytes },
        update: { mimeType, bytes },
      });
    }
  }

  console.log(`Seeded ${DUMMY_CREATORS.length} dummy creators.`);
}

async function main() {
  console.log("Seeding platform_settings with default business configuration...");

  for (const [key, value] of Object.entries(DEFAULT_BUSINESS_CONFIG)) {
    await db.platformSetting.upsert({
      where: { key },
      create: { key, value, description: "Seeded default — see src/lib/config/business.ts" },
      update: {}, // do not clobber values an admin may have already changed
    });
  }

  console.log("Seeding agreement content...");
  for (const agreement of AGREEMENTS) {
    await db.agreement.upsert({
      where: { type_version: { type: agreement.type, version: agreement.version } },
      create: agreement,
      // Never overwrite an existing version's body — AgreementAcceptance
      // rows point at a specific version and that link should stay
      // meaningful (see the Agreement model's own schema comment). A
      // real content change belongs in a new `version` entry, not an
      // edit here.
      update: {},
    });
  }

  console.log("Seeding revenue share rules...");
  for (const rule of REVENUE_SHARE_RULES) {
    await db.revenueShareRule.upsert({
      where: { type_version: { type: rule.type, version: rule.version } },
      create: { type: rule.type, version: rule.version, percentage: rule.percentage, notes: rule.notes },
      // Never overwrite an existing version's percentage — LedgerEntry
      // rows point at a specific version and that link should stay
      // meaningful (same reasoning as Agreement, above). A real rate
      // change belongs in a new `version` entry, not an edit here.
      update: {},
    });
  }

  console.log("Seeding starter categories...");
  for (const category of STARTER_CATEGORIES) {
    await db.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
  }

  await seedDummyCreators();
  await cleanupStrayCreators();

  console.log("Done.");
}

/**
 * Removes any creator account that isn't in DUMMY_CREATORS — cleans up
 * accounts like "Test Stage Name"/"Creator 1"/"E2E Creator" that ended
 * up in the database from other sources (e.g. an E2E test run against
 * this environment) rather than this seed script, per an explicit
 * product decision to keep discovery limited to the known dummy roster.
 * Only ever touches accounts with a CreatorProfile — fans and admins are
 * never in scope here.
 *
 * Content's Report/ModerationCase references are ON DELETE SET NULL
 * (see the init migration), so those cascade cleanly. LedgerEntry and
 * Payout are the one deliberate exception in this schema — ON DELETE
 * RESTRICT on their walletId, so a real financial record can never
 * silently vanish via cascade — so a test account that ever received a
 * dummy tip/subscription/payout needs those rows cleared explicitly
 * before its Wallet (and then the User) can go.
 */
async function cleanupStrayCreators() {
  const keepEmails = DUMMY_CREATORS.map((c) => c.email);
  const stray = await db.user.findMany({
    where: { creatorProfile: { isNot: null }, email: { notIn: keepEmails } },
    select: { id: true, email: true },
  });

  if (stray.length === 0) return;

  console.log(`Removing ${stray.length} stray creator account(s) not in DUMMY_CREATORS...`);
  for (const user of stray) {
    const wallet = await db.wallet.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (wallet) {
      await db.ledgerEntry.deleteMany({ where: { walletId: wallet.id } });
      await db.payout.deleteMany({ where: { walletId: wallet.id } });
    }
    await db.user.delete({ where: { id: user.id } });
    console.log(`  Removed ${user.email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
