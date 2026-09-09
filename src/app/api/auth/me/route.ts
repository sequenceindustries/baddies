import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
          return NextResponse.json({ user: null }, { status: 200 });
    }

  const creatorProfile = await db.creatorProfile.findUnique({
        where: { userId: user.id },
        select: { id: true, status: true, isFoundingBaddie: true },
  });

  // Looked up unconditionally, same as creatorProfile above — an
  // account's role can be CREATOR while it's also a Founding Partner
  // (see /api/partner/dashboard's comment), so "is this a partner" has
  // to come from this row's own existence, never from role alone.
  const foundingPartner = await db.foundingPartner.findUnique({
        where: { userId: user.id },
        select: { id: true, status: true },
  });

  const profile = await db.profile.findUnique({
        where: { userId: user.id },
        select: { displayName: true },
  });

  return NextResponse.json({
        user: {
                id: user.id,
                email: user.email,
                role: user.role,
                displayName: profile?.displayName ?? null,
                emailVerified: user.emailVerified !== null,
                createdAt: user.createdAt.toISOString(),
                creatorProfile: creatorProfile ?? null,
                foundingPartner: foundingPartner ?? null,
        },
  });
}
