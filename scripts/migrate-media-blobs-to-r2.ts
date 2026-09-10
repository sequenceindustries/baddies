import { PrismaClient } from "@prisma/client";
import { getMediaStorageProvider } from "../src/lib/providers/storage";

const db = new PrismaClient();

// Media storage migration, Phase 2. Copies every MediaBlob row's bytes
// to whatever MediaStorageProvider is actually configured (run this
// with MEDIA_STORAGE_PROVIDER=r2 — see the R2_* vars already set on
// Railway). Never deletes MediaBlob rows: the stub table stays intact
// as a safety net (and as StubMediaStorageProvider's own backing store,
// for anyone still running locally under MEDIA_STORAGE_PROVIDER=stub).
// Idempotent — R2 PutObject overwrites by key, so re-running this after
// a partial failure is always safe.
const BATCH_SIZE = 20;

async function main() {
  const storage = getMediaStorageProvider();
  console.log(`Migrating MediaBlob rows to provider "${storage.name}"...`);
  if (storage.name === "stub") {
    console.warn(
      'WARNING: MEDIA_STORAGE_PROVIDER is "stub" — this run will just copy bytes back into the same MediaBlob table. Set MEDIA_STORAGE_PROVIDER=r2 (and the R2_* vars) to actually migrate to R2.'
    );
  }

  const total = await db.mediaBlob.count();
  console.log(`${total} row(s) to migrate.`);

  let migrated = 0;
  const failed: { storageKey: string; error: string }[] = [];
  let cursor: string | undefined;

  for (;;) {
    const batch = await db.mediaBlob.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { storageKey: cursor }, skip: 1 } : {}),
      orderBy: { storageKey: "asc" },
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      try {
        await storage.putObject({ key: row.storageKey, contentType: row.mimeType, body: row.bytes });
        migrated++;
      } catch (err) {
        failed.push({ storageKey: row.storageKey, error: err instanceof Error ? err.message : String(err) });
      }
    }

    cursor = batch[batch.length - 1]!.storageKey;
    console.log(`  ${migrated}/${total} migrated so far (${failed.length} failure(s))...`);
  }

  console.log(`\nDone. ${migrated}/${total} migrated successfully.`);
  if (failed.length > 0) {
    console.log(`\n${failed.length} failure(s) — retry by re-running this script (it's idempotent):`);
    for (const f of failed) console.log(`  ${f.storageKey}: ${f.error}`);
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
