import { nanoid } from "nanoid";
import type { MediaStorageProvider, UploadResult } from "./types";

const DEFAULT_TTL = Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS ?? 300);

/**
 * In-memory stub — for local dev only. Does not actually persist bytes
 * durably or produce cryptographically signed URLs; real implementations
 * (S3/GCS/R2 + CDN) live in sibling files.
 */
export class StubMediaStorageProvider implements MediaStorageProvider {
  readonly name = "stub";
  private store = new Map<string, Buffer>();

  async putObject(params: {
    key: string;
    contentType: string;
    body: Buffer | Uint8Array;
  }): Promise<UploadResult> {
    const key = params.key || `media/${nanoid(16)}`;
    this.store.set(key, Buffer.from(params.body));
    return { storageKey: key };
  }

  async getSignedReadUrl(storageKey: string, ttlSeconds = DEFAULT_TTL): Promise<string> {
    const expires = Date.now() + ttlSeconds * 1000;
    const token = nanoid(24);
    // Simulated signature — a real provider returns a vendor-signed URL.
    return `https://stub-media.local/${encodeURIComponent(storageKey)}?token=${token}&expires=${expires}`;
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.store.delete(storageKey);
  }
}
