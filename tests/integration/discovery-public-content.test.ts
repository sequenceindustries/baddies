import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { getCategoryCreators } from "@/lib/discovery/categories";
import { getFeedPage } from "@/lib/discovery/public-feed";
import { getCreatorPublicContentPage } from "@/lib/creator/public-content";

/**
 * SEO Phase 4 — the three extracted, viewer-null-safe functions now
 * backing /discovery, /discovery/[slug], and a creator's own content
 * list for a signed-out visitor/crawler. Requires a real Postgres
 * connection — skipped automatically if none is reachable.
 */
let dbAvailable = true;

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable) await db.$disconnect();
});

describe.skipIf(!dbAvailable)("SEO Phase 4 public content (integration)", () => {
  const cleanupUserIds: string[] = [];
  const cleanupContentIds: string[] = [];
  const cleanupCategoryIds: string[] = [];

  afterAll(async () => {
    for (const contentId of cleanupContentIds) {
      await db.content.deleteMany({ where: { id: contentId } });
    }
    for (const userId of cleanupUserIds) {
      await db.creatorCategory.deleteMany({ where: { creatorProfile: { userId } } });
      await db.creatorProfile.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    for (const categoryId of cleanupCategoryIds) {
      await db.category.deleteMany({ where: { id: categoryId } });
    }
  });

  async function createCreator(suffix: string) {
    const email = `discovery-public-${suffix}-${Date.now()}@example.test`;
    const user = await db.user.create({
      data: { email, passwordHash: "test-hash", role: "CREATOR", profile: { create: { displayName: `Creator ${suffix}` } } },
    });
    cleanupUserIds.push(user.id);
    const creatorProfile = await db.creatorProfile.create({ data: { userId: user.id, status: "VERIFIED" } });
    return creatorProfile;
  }

  async function createContent(creatorProfileId: string, accessLevel: "FREE" | "VIP" | "VVIP", caption: string) {
    const content = await db.content.create({
      data: { creatorProfileId, mediaType: "IMAGE", accessLevel, status: "APPROVED", publishedAt: new Date(), caption },
    });
    cleanupContentIds.push(content.id);
    return content;
  }

  it("getCreatorPublicContentPage returns real items for an anonymous (null) viewer", async () => {
    const creator = await createCreator("content-anon");
    await createContent(creator.id, "FREE", "A real public caption.");
    const page = await getCreatorPublicContentPage({ creatorProfileId: creator.id, viewer: null });
    expect(page).not.toBeNull();
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0]?.caption).toBe("A real public caption.");
    expect(page?.items[0]?.lock.locked).toBe(false);
  });

  it("getCreatorPublicContentPage returns null for a non-VERIFIED creator", async () => {
    const user = await db.user.create({
      data: { email: `discovery-pending-${Date.now()}@example.test`, passwordHash: "x", role: "CREATOR" },
    });
    cleanupUserIds.push(user.id);
    const creator = await db.creatorProfile.create({ data: { userId: user.id, status: "PENDING" } });
    const page = await getCreatorPublicContentPage({ creatorProfileId: creator.id, viewer: null });
    expect(page).toBeNull();
  });

  it("getFeedPage discovery scope filters out locked (VVIP) items for an anonymous viewer, never leaking a media URL", async () => {
    const creator = await createCreator("feed-locked");
    await createContent(creator.id, "FREE", "Unlocked free post.");
    await createContent(creator.id, "VVIP", "Locked exclusive post.");

    const { items } = await getFeedPage({ scope: "discovery", viewer: null });
    const captions = items.map((i) => i.caption);
    expect(captions).toContain("Unlocked free post.");
    expect(captions).not.toContain("Locked exclusive post.");
    for (const item of items) {
      expect(item.lock.locked).toBe(false);
    }
  });

  it("getCategoryCreators returns null for an unknown slug", async () => {
    const result = await getCategoryCreators(`nonexistent-slug-${Date.now()}`);
    expect(result).toBeNull();
  });

  it("getCategoryCreators returns the real category name and its verified creators", async () => {
    const slug = `test-category-${Date.now()}`;
    const category = await db.category.create({ data: { slug, name: "Test Category" } });
    cleanupCategoryIds.push(category.id);
    const creator = await createCreator("category");
    await db.creatorCategory.create({ data: { creatorProfileId: creator.id, categoryId: category.id } });

    const result = await getCategoryCreators(slug);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Test Category");
    expect(result?.creators.some((c) => c.creatorProfileId === creator.id)).toBe(true);
  });
});
