import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { MediaStorageProvider, UploadResult } from "./types";

const DEFAULT_TTL = Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS ?? 300);

// SigV4 presigned URLs cap at 7 days — this is enforced by the S3/R2
// signing protocol itself, not a preference. A caller asking for longer
// (persist-public-image.ts's PUBLIC_IMAGE_TTL_SECONDS did, before this
// provider existed) gets silently clamped here rather than producing a
// URL R2 would reject outright.
const MAX_TTL_SECONDS = 60 * 60 * 24 * 7;

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (cachedClient) return cachedClient;
  // region MUST be "auto" for R2 — not a real AWS region. R2's own docs
  // specify this; it's part of the SigV4 signing scope, so getting it
  // wrong doesn't error loudly, it just produces signatures R2 rejects.
  // Do not "fix" this to a real AWS region.
  cachedClient = new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return cachedClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when MEDIA_STORAGE_PROVIDER=r2.`);
  }
  return value;
}

/**
 * Real object storage — Cloudflare R2, accessed through its S3-compatible
 * API. Per storage/types.ts's own contract, this only ever hands out
 * short-lived signed read URLs, never a bare public bucket URL — the R2
 * bucket itself stays private (no public access binding), matching the
 * stub provider's exact same never-leak invariant, just backed by a real
 * CDN-fronted store instead of a Postgres table.
 */
export class R2MediaStorageProvider implements MediaStorageProvider {
  readonly name = "r2";

  async putObject(params: { key: string; contentType: string; body: Buffer | Uint8Array }): Promise<UploadResult> {
    await client().send(
      new PutObjectCommand({
        Bucket: requireEnv("R2_BUCKET_NAME"),
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      })
    );
    return { storageKey: params.key };
  }

  async getSignedReadUrl(storageKey: string, ttlSeconds = DEFAULT_TTL): Promise<string> {
    const command = new GetObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: storageKey });
    return getSignedUrl(client(), command, { expiresIn: Math.min(ttlSeconds, MAX_TTL_SECONDS) });
  }

  async deleteObject(storageKey: string): Promise<void> {
    await client().send(new DeleteObjectCommand({ Bucket: requireEnv("R2_BUCKET_NAME"), Key: storageKey }));
  }
}
