import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { ContentStatus, MediaType, ContentAccessLevel, Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STATUSES: ContentStatus[] = ["DRAFT", "UPLOADED", "PROCESSING", "PENDING_REVIEW", "APPROVED", "REJECTED", "REMOVED"];
const MEDIA_TYPES: MediaType[] = ["IMAGE", "VIDEO", "AUDIO"];
const ACCESS_LEVELS: ContentAccessLevel[] = ["FREE", "VIP", "VVIP", "PPV"];

/**
 * Two modes on one route, kept backward-compatible: with no `status`
 * param this is exactly the moderation queue it always was (§10, §23) —
 * PENDING_REVIEW only, same shape, ContentQueue's existing behavior
 * untouched. With a `status` param (including "all") it's the Content
 * Library: every item regardless of status, searchable/filterable,
 * cursor-paginated, with a statusCounts breakdown for the library's
 * stat chips.
 *
 * Deliberately returns caption and classification metadata but leaves
 * media retrieval to a separate, explicitly-audited signed-URL step
 * rather than embedding signed URLs directly in a list response — keeps
 * sensitive media access individually accountable in the audit log.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "content:moderate");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const params = req.nextUrl.searchParams;
  const statusParam = params.get("status");

  if (!statusParam) {
    // Original queue behavior, byte-for-byte — ContentQueue depends on this.
    const queue = await db.content.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        mediaType: true,
        accessLevel: true,
        caption: true,
        createdAt: true,
        creatorProfile: { select: { id: true, user: { select: { email: true } } } },
        participants: { select: { verificationParticipantId: true } },
      },
    });

    return NextResponse.json({
      queue: queue.map((item: (typeof queue)[number]) => ({
        contentId: item.id,
        mediaType: item.mediaType,
        accessLevel: item.accessLevel,
        caption: item.caption,
        createdAt: item.createdAt,
        creatorProfileId: item.creatorProfile.id,
        creatorEmail: item.creatorProfile.user.email,
        participantCount: item.participants.length,
      })),
    });
  }

  // Library mode.
  const status = STATUSES.includes(statusParam as ContentStatus) ? (statusParam as ContentStatus) : undefined;
  const query = params.get("query")?.trim();
  const mediaTypeParam = params.get("mediaType");
  const mediaType = mediaTypeParam && MEDIA_TYPES.includes(mediaTypeParam as MediaType) ? (mediaTypeParam as MediaType) : undefined;
  const accessLevelParam = params.get("accessLevel");
  const accessLevel = accessLevelParam && ACCESS_LEVELS.includes(accessLevelParam as ContentAccessLevel) ? (accessLevelParam as ContentAccessLevel) : undefined;
  const creatorProfileId = params.get("creatorProfileId") ?? undefined;
  const since = params.get("since");
  const until = params.get("until");
  const cursor = params.get("cursor") ?? undefined;

  const where: Prisma.ContentWhereInput = {
    ...(status ? { status } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(accessLevel ? { accessLevel } : {}),
    ...(creatorProfileId ? { creatorProfileId } : {}),
    ...(since || until
      ? {
          createdAt: {
            ...(since ? { gte: new Date(since) } : {}),
            ...(until ? { lte: new Date(until) } : {}),
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            { caption: { contains: query, mode: "insensitive" } },
            { creatorProfile: { user: { email: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [rows, statusCounts] = await Promise.all([
    db.content.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        mediaType: true,
        accessLevel: true,
        status: true,
        caption: true,
        createdAt: true,
        creatorProfile: { select: { id: true, user: { select: { email: true } } } },
      },
    }),
    db.content.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ContentStatus, number>;
  for (const row of statusCounts) counts[row.status] = row._count._all;

  return NextResponse.json({
    items: page.map((item) => ({
      contentId: item.id,
      mediaType: item.mediaType,
      accessLevel: item.accessLevel,
      status: item.status,
      caption: item.caption,
      createdAt: item.createdAt,
      creatorProfileId: item.creatorProfile.id,
      creatorEmail: item.creatorProfile.user.email,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
    statusCounts: { total: Object.values(counts).reduce((a, b) => a + b, 0), ...counts },
  });
}
