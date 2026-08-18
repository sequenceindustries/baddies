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
                creatorProfile: creatorProfile ?? null,
        },
  });
}
