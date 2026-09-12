import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route mutates live production data and must
// never be statically prerendered or cached.
export const dynamic = "force-dynamic";

// Same "type the exact phrase" second-step pattern as reset-founding-
// roster/wipe-test-content — see reset-founding-roster's own doc
// comment for why a single click is deliberately not enough here.
const CONFIRM_PHRASE = "DELETE FAN ACCOUNTS";

// The one fan account this never touches, per direct request ("delete
// fan accounts except for fan test") — matches the exact fixture
// email this project's own verification history already treats as a
// standing keeper (see this session's memory / prior phase checklists:
// "keep admin@example.test, the 5 seeded dummy creators, fan-test@
// example.test"). Case-insensitive match, same as the founding-email
// matching elsewhere in this admin area.
const PRESERVED_FAN_EMAIL = "fan-test@example.test";

const DeleteSchema = z.object({ confirm: z.literal(CONFIRM_PHRASE) });

/**
 * Irreversibly deletes every FAN-role account except PRESERVED_FAN_EMAIL.
 * Never runs on its own — an admin triggers it from their own real,
 * authenticated session (System nav group), same as reset-founding-
 * roster/wipe-test-content.
 *
 * Safety model: everything happens inside one db.$transaction — if any
 * foreign-key constraint blocks a step, the whole transaction rolls
 * back rather than leaving a partially-deleted account behind.
 * Confirmed against this schema directly (not assumed) before writing
 * this: every FAN-side relation (Follow, ContentLike, Subscription,
 * FanTrial, QualifiedConsumptionEvent, Purchase, Tip, Message[sender],
 * Report, Session, Notification, AgreementAcceptance, Block, Wallet
 * itself) is `onDelete: Cascade` on the User FK — deleting the User
 * row cleans all of those up automatically. The one deliberate
 * exception, matching reset-founding-roster's own reasoning: LedgerEntry
 * and Payout are `onDelete: Restrict` on their walletId (a real
 * financial record must never silently vanish via cascade), so a fan's
 * own Wallet can't cascade-delete while either still references it —
 * those are cleared explicitly, first, same as that route does for
 * creator/partner wallets. In practice a plain fan should have neither
 * (ledger entries are creator earnings), but this doesn't assume that,
 * it clears them if present.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    requirePermission(user.role, "system:delete_fan_accounts");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Type the exact phrase "${CONFIRM_PHRASE}" to confirm.` },
      { status: 400 }
    );
  }

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  const summary = await db.$transaction(async (tx) => {
    const targets = await tx.user.findMany({
      where: {
        role: "FAN",
        NOT: { email: { equals: PRESERVED_FAN_EMAIL, mode: "insensitive" } },
      },
      select: { id: true },
    });
    const userIds = targets.map((u) => u.id);

    const wallets = await tx.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const walletIds = wallets.map((w) => w.id);
    const ledgerEntriesRemoved = await tx.ledgerEntry.deleteMany({ where: { walletId: { in: walletIds } } });
    const payoutsRemoved = await tx.payout.deleteMany({ where: { walletId: { in: walletIds } } });

    const usersRemoved = await tx.user.deleteMany({ where: { id: { in: userIds } } });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "system.delete_fan_accounts",
        targetType: "system",
        targetId: "fan_accounts",
        metadata: {
          usersRemoved: usersRemoved.count,
          ledgerEntriesRemoved: ledgerEntriesRemoved.count,
          payoutsRemoved: payoutsRemoved.count,
          preservedEmail: PRESERVED_FAN_EMAIL,
        },
        ipAddress,
      },
    });

    return { usersRemoved: usersRemoved.count };
  });

  return NextResponse.json({ deleted: summary, preservedEmail: PRESERVED_FAN_EMAIL });
}
