import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import type { MediaStorageProvider, UploadResult } from "./types";

const DEFAULT_TTL = Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS ?? 300);

const STORE_DIR = path.join(os.tmpdir(), "baddies-stub-media");

function fileFor(storageKey: string): string {
  // storageKey contains slashes (e.g. "creators/:id/content/:id"); flatten
  // it to a single safe filename rather than trying to mirror it as a
  // directory tree.
  const safe = crypto.createHash("sha256").update(storageKey).digest("hex");
  return path.join(STORE_DIR, safe);
}

/**
 * In-memory-adjacent stub — for local dev only, backed by the OS temp
 * directory rather than a module-level Map. A plain in-memory Map does not
 * reliably survive across requests here: Next.js dev can re-evaluate route
 * modules independently per route, so state written by one API route isn't
 * guaranteed visible to another. Disk (scoped to this process's tmpdir) is
 * the simplest thing that actually round-trips bytes across requests.
 *
 * getSignedReadUrl is a genuinely self-contained signed URL (HMAC over
 * storageKey + expiry, keyed off AUTH_SECRET) rather than a server-side
 * token lookup — no shared state required between the route that issues it
 * and the route that serves it, which sidesteps the module-caching problem
 * entirely instead of working around it.
 *
 * Served by /api/dev-stub-media, which 404s unless
 * MEDIA_STORAGE_PROVIDER=stub — inert wherever a real provider is
 * configured. (Not nested under an "_dev" folder — a leading underscore is
 * a Next.js "private folder" convention that opts a directory out of
 * routing entirely, which silently made an earlier version of this route
 * unreachable no matter what was under it.)
 */
export class StubMediaStorageProvider implements MediaStorageProvider {
  readonly name = "stub";

  async putObject(params: {
    key: string;
    contentType: string;
    body: Buffer | Uint8Array;
  }): Promise<UploadResult> {
    const key = params.key || `media/${crypto.randomUUID()}`;
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(fileFor(key), Buffer.from(params.body));
    fs.writeFileSync(fileFor(key) + ".type", params.contentType, "utf8");
    return { storageKey: key };
  }

  async getSignedReadUrl(storageKey: string, ttlSeconds = DEFAULT_TTL): Promise<string> {
    const expires = Date.now() + ttlSeconds * 1000;
    const sig = sign(storageKey, expires);
    return `/api/dev-stub-media?key=${encodeURIComponent(storageKey)}&expires=${expires}&sig=${sig}`;
  }

  async deleteObject(storageKey: string): Promise<void> {
    fs.rmSync(fileFor(storageKey), { force: true });
    fs.rmSync(fileFor(storageKey) + ".type", { force: true });
  }
}

function sign(storageKey: string, expires: number): string {
  const secret = process.env.AUTH_SECRET ?? "dev-only-insecure-fallback";
  return crypto.createHmac("sha256", secret).update(`${storageKey}:${expires}`).digest("hex");
}

/** Used only by the /api/_dev/stub-media/[...key] route — never exported to application code. */
export function readStubMedia(
  storageKey: string,
  expires: number,
  sig: string
): { body: Buffer; contentType: string } | null {
  if (Date.now() > expires) return null;
  if (sig !== sign(storageKey, expires)) return null;

  const file = fileFor(storageKey);
  if (!fs.existsSync(file)) return null;

  const body = fs.readFileSync(file);
  const contentType = fs.existsSync(file + ".type") ? fs.readFileSync(file + ".type", "utf8") : "application/octet-stream";
  return { body, contentType };
}
