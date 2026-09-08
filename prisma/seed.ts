import { PrismaClient } from "@prisma/client";
import { DEFAULT_BUSINESS_CONFIG } from "../src/lib/config/business";
import { AGREEMENTS } from "./agreements";
import { REVENUE_SHARE_RULES } from "./revenue-rules";
import { DUMMY_CREATORS, seedDummyCreators } from "../src/lib/founding/dummy-creators";

const db = new PrismaClient();

// Small, deliberately flat starter set — admins can add more via the
// (future) admin category management UI. Not meant to be exhaustive.
const STARTER_CATEGORIES = [
  { slug: "south-african", name: "South African" },
  { slug: "new-baddies", name: "New Baddies" },
  { slug: "cosplay", name: "Cosplay" },
  { slug: "fitness", name: "Fitness" },
];

// DUMMY_CREATORS/DUMMY_PASSWORD and the actual account-writing logic now
// live in src/lib/founding/dummy-creators.ts — it's called from here AND
// from the admin "reset founding roster" route (production's own way to
// get back to exactly this roster), so it can't stay a local-only script
// function anymore. See that file for the roster and seeding logic.

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

  await seedDummyCreators(db);

  // Production-only guard, not an environment-flavor preference: this
  // used to run everywhere, including against the real production
  // database on every single deploy (prisma/seed.ts is this app's
  // preDeployCommand). Its own matching rule is "any account with a
  // CreatorProfile whose email isn't one of the 8 hardcoded
  // DUMMY_CREATORS" — which was never actually scoped to test/E2E
  // debris, it was scoped to "not dummy," and a real, live, human
  // creator on production is exactly as "not dummy" as leftover E2E
  // test rows are. It surfaced the hard way: the first real account that
  // was ALSO a Founding Partner (see prisma/schema.prisma's
  // FoundingPartner/ReferralAttribution models) hit this on a deploy,
  // and only a foreign-key constraint (a real ReferralAttribution
  // pointing at that partner) stopped a real user's account from being
  // silently deleted — it just failed the deploy loudly instead. A
  // plain real creator with no such reference would have gone through
  // with no error at all. This was always live user-data risk, not just
  // today's deploy failure.
  if (process.env.NODE_ENV !== "production") {
    await cleanupStrayCreators();
  } else {
    console.log("Skipping stray-creator cleanup in production — see this function's own comment.");
  }

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
 * Never call this against production (see the guard at this function's
 * one call site) — it has no way to distinguish real registered
 * creators from test debris beyond "not in the dummy list," which a
 * real production account will always fail too.
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
