import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { seedDummyCreators, DUMMY_CREATORS } from "@/lib/founding/dummy-creators";

// Always dynamic: this route mutates live production data and must
// never be statically prerendered or cached.
export const dynamic = "force-dynamic";

// The confirmation phrase an admin must type into the UI and send back
// verbatim — a real, deliberate second step (not just "click a button")
// given what this does. Case-sensitive, checked server-side; the UI
// enforces the same string.
const CONFIRM_PHRASE = "RESET FOUNDING ROSTER";

const ResetSchema = z.object({ confirm: z.literal(CONFIRM_PHRASE) });

/**
 * Irreversibly deletes every real Founding Partner, every Founding Baddie
 * application, and every creator account (dummy or real) — then reseeds
 * exactly the 5-account DUMMY_CREATORS roster from
 * src/lib/founding/dummy-creators.ts. Built for one specific product
 * decision: "do not limit founding partners; remove all partners,
 * founding baddies, and creators, leave only 5 founding baddies."
 *
 * This never runs on its own — an admin triggers it from their own real,
 * authenticated session (see the Command Centre's System tab). Nothing
 * here runs automatically on deploy, unlike the seed script's own
 * (now production-disabled) stray-creator cleanup — see prisma/seed.ts's
 * comment on that incident for why an unattended deletion against
 * production is exactly what this route is built to avoid repeating.
 *
 * Safety model: every delete happens inside one db.$transaction. If any
 * foreign-key constraint this route's author didn't anticipate blocks a
 * step, the whole transaction rolls back — nothing partial is ever left
 * behind, the same failure mode that (harmlessly, if accidentally) saved
 * a real account during the incident referenced above. The delete order
 * below still aims to succeed outright, not just fail safely:
 *   1. FoundingApplication rows (cascades ReferralAttribution/Identity/
 *      IdentityDocument/Contact/AgreementAcceptance) — done first so no
 *      ReferralAttribution is left pointing at a FoundingPartner about to
 *      be deleted (that FK has no cascade; deleting the application it
 *      belongs to is what clears it).
 *   2. LedgerEntry + Payout rows for every wallet/creatorProfile in
 *      scope — both are the deliberate ON DELETE RESTRICT financial
 *      records in this schema (a real ledger entry must never silently
 *      vanish via cascade), so they're the one thing that must be
 *      explicitly cleared before the Wallet/CreatorProfile that owns them
 *      can go. (There should be none for the dummy roster — its own
 *      wallets are just idle — but real partner/creator accounts may
 *      have genuine ledger history.)
 *   3. FoundingPartner rows in scope, explicitly (not left to User's own
 *      cascade) — FoundingPartner.invitationId has no cascade, so a live
 *      FoundingPartner blocks deleting the PartnerInvitation it points at;
 *      this has to go first.
 *   4. PartnerInvitation rows (now unreferenced) — also has to go before
 *      step 5: PartnerInvitation.invitedBy has no cascade either, so a
 *      User who ever sent an invitation can't be deleted while that
 *      invitation row still exists. Confirmed against a real local
 *      blocked-delete case during this route's own build — see the
 *      inline comment at this step for what that looked like.
 *   5. The User rows themselves — cascades Wallet, CreatorProfile (and
 *      everything that cascades from CreatorProfile: Content and every
 *      one of its own children, Follow, Subscription, etc.), Session,
 *      Profile, and User-linked AgreementAcceptance.
 * Then, outside the transaction (real network calls to fetch seed
 * photos can't safely run inside a held DB transaction), reseed the 5
 * DUMMY_CREATORS accounts — a set of idempotent upserts, safe to re-run
 * if this step needs retrying on its own.
 *
 * Known limitation, disclosed rather than silently ignored: this does
 * not delete the underlying MediaBlob/storage-provider bytes for
 * removed content or identity documents (no route in this codebase
 * calls MediaStorageProvider.deleteObject today — see that file's own
 * comment). Those rows become orphaned, unreferenced storage rather
 * than immediately reclaimed; fine for the stub provider this app runs
 * on today, worth a real cleanup job before a production object-storage
 * provider is wired up.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    requirePermission(user.role, "system:reset_founding_roster");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = ResetSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Type the exact phrase "${CONFIRM_PHRASE}" to confirm.` },
      { status: 400 }
    );
  }

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  const summary = await db.$transaction(async (tx) => {
    const partners = await tx.foundingPartner.findMany({ select: { id: true, userId: true } });
    const creatorProfiles = await tx.creatorProfile.findMany({ select: { id: true, userId: true } });

    const userIds = Array.from(new Set([...partners.map((p) => p.userId), ...creatorProfiles.map((c) => c.userId)]));
    const partnerIds = partners.map((p) => p.id);
    const creatorProfileIds = creatorProfiles.map((c) => c.id);

    // Step 1 — clears every ReferralAttribution row too (onDelete: Cascade
    // from FoundingApplication), which is what unblocks step 4's User
    // deletion for any partner that was ever referred a creator.
    const applicationsRemoved = await tx.foundingApplication.deleteMany({});

    // Step 2 — the two RESTRICT-on-delete financial tables. Matched by
    // wallet (covers partners) and separately by creatorProfileId
    // (LedgerEntry's own optional creator reference), since a ledger
    // entry can name a creatorProfileId without that creator owning the
    // wallet it was posted against.
    const wallets = await tx.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const walletIds = wallets.map((w) => w.id);
    const ledgerEntriesRemoved = await tx.ledgerEntry.deleteMany({
      where: { OR: [{ walletId: { in: walletIds } }, { creatorProfileId: { in: creatorProfileIds } }] },
    });
    const payoutsRemoved = await tx.payout.deleteMany({ where: { walletId: { in: walletIds } } });

    // Step 3 — FoundingPartner must go before PartnerInvitation, not the
    // other way round: FoundingPartner.invitationId has no cascade, so a
    // live FoundingPartner row blocks deleting the PartnerInvitation it
    // points at. (Relying on User's own cascade to remove FoundingPartner
    // here isn't enough on its own — see step 5's comment.)
    await tx.foundingPartner.deleteMany({ where: { id: { in: partnerIds } } });

    // Step 4 — must also go before deleting Users: PartnerInvitation.invitedBy
    // has no cascade either, so a User who ever sent an invitation (in
    // practice always an admin — but this makes no assumption about who)
    // can't be deleted while that invitation row still exists. Confirmed
    // against a real local blocked-delete case: without this ordering,
    // the whole transaction failed here (and safely rolled back — see
    // this route's own doc comment on why that's the point of wrapping
    // all of this in one transaction) with a foreign key violation on
    // partner_invitations_invitedBy_fkey.
    await tx.partnerInvitation.deleteMany({});

    // Step 5
    const usersRemoved = await tx.user.deleteMany({ where: { id: { in: userIds } } });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "system.reset_founding_roster",
        targetType: "system",
        targetId: "founding_roster",
        metadata: {
          usersRemoved: usersRemoved.count,
          partnersRemoved: partnerIds.length,
          creatorsRemoved: creatorProfileIds.length,
          applicationsRemoved: applicationsRemoved.count,
          ledgerEntriesRemoved: ledgerEntriesRemoved.count,
          payoutsRemoved: payoutsRemoved.count,
        },
        ipAddress,
      },
    });

    return {
      usersRemoved: usersRemoved.count,
      partnersRemoved: partnerIds.length,
      creatorsRemoved: creatorProfileIds.length,
      applicationsRemoved: applicationsRemoved.count,
    };
  });

  // Reseed outside the transaction — real network fetches to Unsplash
  // for each dummy creator's avatar/cover/post photos, which must not
  // run inside a held DB transaction. Idempotent upserts, so a failure
  // here (e.g. Unsplash unreachable — each photo already falls back to
  // a gradient placeholder rather than hard-failing) leaves the roster
  // partially seeded rather than corrupted, and simply re-POSTing this
  // route is always safe to retry.
  let reseedError: string | null = null;
  try {
    await seedDummyCreators(db);
  } catch (err) {
    console.error("[reset-founding-roster] reseed failed", err);
    reseedError = err instanceof Error ? err.message : "Unknown reseed error";
  }

  return NextResponse.json({
    deleted: summary,
    reseeded: reseedError === null,
    reseedError,
    seededCreatorCount: DUMMY_CREATORS.length,
  });
}
