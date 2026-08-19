import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Edit the current user's own public Profile (displayName/bio/avatarUrl/
 * country/city). Deliberately does not touch CreatorProfile — see PATCH
 * /api/creator/settings for the creator-only fields (pricing overrides,
 * privacy toggles, Unlimited opt-in).
 *
 * country/city are mandatory (see Profile's comment in
 * prisma/schema.prisma) — unlike bio/avatarUrl, they cannot be cleared
 * back to null once set, only replaced with another non-empty value.
 */
const UpdateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  bio: z.string().max(2000).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  country: z.string().min(1, "Country is required").max(100).optional(),
  city: z.string().min(1, "City is required").max(100).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({
    displayName: profile?.displayName ?? null,
    bio: profile?.bio ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    country: profile?.country ?? null,
    city: profile?.city ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UpdateProfileSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await db.profile.update({
    where: { userId: user.id },
    data: parsed.data,
  });

  return NextResponse.json({
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    country: profile.country,
    city: profile.city,
  });
}
