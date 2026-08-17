import { PrismaClient } from "@prisma/client";
import { DEFAULT_BUSINESS_CONFIG } from "../src/lib/config/business";

const db = new PrismaClient();

// Small, deliberately flat starter set — admins can add more via the
// (future) admin category management UI. Not meant to be exhaustive.
const STARTER_CATEGORIES = [
  { slug: "south-african", name: "South African" },
  { slug: "new-baddies", name: "New Baddies" },
  { slug: "cosplay", name: "Cosplay" },
  { slug: "fitness", name: "Fitness" },
];

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
