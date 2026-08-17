/**
 * MediaStorageProvider — private object storage with short-lived signed
 * URLs. Per build brief §9: media access must always flow
 *   User → Authorization → Content entitlement → Signed media access
 * and NEVER
 *   User → Public storage URL
 *
 * Application code must never construct a storage URL by hand — always go
 * through `getSignedReadUrl`, which callers should only invoke after
 * confirming entitlement via src/lib/entitlements/content.ts.
 */

export interface UploadResult {
  storageKey: string; // private key, not a URL
}

export interface MediaStorageProvider {
  readonly name: string;

  /** Uploads to private storage. Returns an opaque key, never a public URL. */
  putObject(params: {
    key: string;
    contentType: string;
    body: Buffer | Uint8Array;
  }): Promise<UploadResult>;

  /** Issues a short-lived signed URL for an already-entitled read. */
  getSignedReadUrl(storageKey: string, ttlSeconds?: number): Promise<string>;

  deleteObject(storageKey: string): Promise<void>;
}
