import crypto from "crypto";
import { db } from "@/lib/db/client";
import type { MediaStorageProvider, UploadResult } from "./types";

const DEFAULT_TTL = Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS ?? 300);

/**
 * DB-backed stub — for local dev and demo/seed data only, backed by the
 * MediaBlob table rather than local disk. A plain local-disk store (the
 * original version of this file) does not survive Railway's deploy
 * pipeline: `preDeployCommand` (migrate + seed) runs in a separate,
 * throwaway container from the one that actually serves requests, so
 * anything seeded to disk there would vanish before the app ever started.
 * Postgres is the one thing both containers share.
 *
 * getSignedReadUrl is a genuinely self-contained signed URL (HMAC over
 * storageKey + expiry, keyed off AUTH_SECRET) rather than a server-side
 * token lookup — no shared state required beyond the row itself.
 *
 * Served by /api/dev-stub-media, which 404s unless
 * MEDIA_STORAGE_PROVIDER=stub — inert wherever a real provider is
 * configured.
 */
export class StubMediaStorageProvider implements MediaStorageProvider {
  readonly name = "stub";

  async putObject(params: {
    key: string;
    contentType: string;
    body: Buffer | Uint8Array;
  }): Promise<UploadResult> {
    const key = params.key || `media/${crypto.randomUUID()}`;
    await db.mediaBlob.upsert({
      where: { storageKey: key },
      create: { storageKey: key, mimeType: params.contentType, bytes: Buffer.from(params.body) },
      update: { mimeType: params.contentType, bytes: Buffer.from(params.body) },
    });
    return { storageKey: key };
  }

  async getSignedReadUrl(storageKey: string, ttlSeconds = DEFAULT_TTL): Promise<string> {
    const expires = Date.now() + ttlSeconds * 1000;
    const sig = sign(storageKey, expires);
    return `/api/dev-stub-media?key=${encodeURIComponent(storageKey)}&expires=${expires}&sig=${sig}`;
  }

  async deleteObject(storageKey: string): Promise<void> {
    await db.mediaBlob.deleteMany({ where: { storageKey } });
  }
}

function sign(storageKey: string, expires: number): string {
  const secret = process.env.AUTH_SECRET ?? "dev-only-insecure-fallback";
  return crypto.createHmac("sha256", secret).update(`${storageKey}:${expires}`).digest("hex");
}

/** Used only by /api/dev-stub-media — never exported to application code. */
export async function readStubMedia(
  storageKey: string,
  expires: number,
  sig: string
): Promise<{ body: Buffer; contentType: string } | null> {
  if (Date.now() > expires) return null;
  if (sig !== sign(storageKey, expires)) return null;

  const row = await db.mediaBlob.findUnique({ where: { storageKey } });
  if (!row) return null;

  return { body: Buffer.from(row.bytes), contentType: row.mimeType };
}
