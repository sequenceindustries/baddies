import { PrismaClient } from "@prisma/client";
import { DEFAULT_BUSINESS_CONFIG } from "../src/lib/config/business";
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
  posts: DummyPost[];
}

const DUMMY_CREATORS: DummyCreatorSpec[] = [
  {
    slug: "seed-thandeka",
    email: "thandeka@dummy.baddies.local",
    displayName: "Thandeka",
    legalName: "Dummy Seed Account — Thandeka",
    bio: "Cape Town born and raised. Golden hour on the promenade, always. New here — say hi 👋",
    country: "South Africa",
    city: "Cape Town",
    vvipPriceUsd: "7.99",
    colorA: "#c9a961",
    colorB: "#0e0e11",
    posts: [
      { tier: "FREE", caption: "Table Mountain never gets old 🏔️", daysAgo: 9 },
      { tier: "FREE", caption: "Sunday market run, Bo-Kaap edition.", daysAgo: 4 },
      { tier: "VIP", caption: "Studio session behind the scenes — VIP only 💛", daysAgo: 6 },
      { tier: "VIP", caption: "A little preview from this week's shoot.", daysAgo: 2 },
      { tier: "VVIP", caption: "For my Exclusive baddies only 🔒", daysAgo: 5 },
      { tier: "VVIP", caption: "Full set just dropped for subscribers.", daysAgo: 1 },
    ],
  },
  {
    slug: "seed-amara",
    email: "amara@dummy.baddies.local",
    displayName: "Amara",
    legalName: "Dummy Seed Account — Amara",
    bio: "Joburg energy, always. Fitness, fashion, and everything in between. Verified Baddie ✓",
    country: "South Africa",
    city: "Johannesburg",
    vvipPriceUsd: "12.99",
    colorA: "#7c2d3b",
    colorB: "#1e1e25",
    posts: [
      { tier: "FREE", caption: "Morning run before the city wakes up.", daysAgo: 8 },
      { tier: "FREE", caption: "New look, who dis?", daysAgo: 3 },
      { tier: "VIP", caption: "VIP pass holders get this whole gallery.", daysAgo: 7 },
      { tier: "VIP", caption: "Gym look of the week.", daysAgo: 2 },
      { tier: "VVIP", caption: "Subscribers only — the real behind the scenes.", daysAgo: 4 },
      { tier: "VVIP", caption: "Thank you for 1k subscribers 🖤", daysAgo: 1 },
    ],
  },
  {
    slug: "seed-zoe",
    email: "zoe@dummy.baddies.local",
    displayName: "Zoe",
    legalName: "Dummy Seed Account — Zoe",
    bio: "London based, South African at heart. Global Baddie, local roots. New account, big plans ✨",
    country: "United Kingdom",
    city: "London",
    vvipPriceUsd: "9.99",
    colorA: "#4c5faf",
    colorB: "#0e0e11",
    posts: [
      { tier: "FREE", caption: "Golden hour by the Thames.", daysAgo: 10 },
      { tier: "FREE", caption: "First post here — thanks for the follows!", daysAgo: 5 },
      { tier: "VIP", caption: "VIP-tier drop for everyone with the pass.", daysAgo: 6 },
      { tier: "VIP", caption: "Behind the scenes from today's shoot.", daysAgo: 3 },
      { tier: "VVIP", caption: "Exclusive content — subscribers see it first.", daysAgo: 4 },
      { tier: "VVIP", caption: "This week's full exclusive set is up.", daysAgo: 1 },
    ],
  },
];

/** Small circular avatar — initial on a gradient — as a self-contained data: URI. Profile.avatarUrl is a plain string field, no storage provider involved. */
function avatarDataUri(initial: string, colorA: string, colorB: string): string {
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

/** Abstract gradient placeholder "post" image — no real media exists for seed accounts, so posts get a tasteful branded placeholder rather than nothing. 16:10 to match the timeline's large-media aspect ratio. */
function postSvgBytes(label: string, tierLabel: string, colorA: string, colorB: string): Buffer {
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

async function seedDummyCreators() {
  console.log("Seeding dummy creator accounts...");

  for (const spec of DUMMY_CREATORS) {
    const passwordHash = await hashPassword(DUMMY_PASSWORD);
    const legalNameEncrypted = encryptField(spec.legalName);
    const avatarUrl = avatarDataUri(spec.displayName.charAt(0).toUpperCase(), spec.colorA, spec.colorB);

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
      },
      update: {
        status: "VERIFIED",
        vvipPriceOverride: spec.vvipPriceUsd,
        unlimitedOptedIn: true,
        subscriberCountVisible: true,
        locationVisible: true,
      },
    });

    for (const [i, post] of spec.posts.entries()) {
      const contentId = `${spec.slug}-post-${i + 1}`;
      const publishedAt = new Date(Date.now() - post.daysAgo * 24 * 60 * 60 * 1000);
      const storageKey = `creators/${creatorProfile.id}/content/${contentId}`;
      const bytes = postSvgBytes(spec.displayName, post.tier === "VVIP" ? "Exclusive" : post.tier, spec.colorA, spec.colorB);

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
          mimeType: "image/svg+xml",
          byteSize: bytes.byteLength,
        },
        update: { byteSize: bytes.byteLength },
      });

      // Mirrors what StubMediaStorageProvider.putObject does — writing
      // directly here (rather than going through the provider) keeps this
      // script decoupled from which provider is configured, and seeding
      // only ever targets the stub provider's backing table anyway.
      await db.mediaBlob.upsert({
        where: { storageKey },
        create: { storageKey, mimeType: "image/svg+xml", bytes },
        update: { bytes },
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

  console.log("Seeding starter categories...");
  for (const category of STARTER_CATEGORIES) {
    await db.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
  }

  await seedDummyCreators();

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
