import type { MediaStorageProvider } from "./types";
import { StubMediaStorageProvider } from "./stub";
import { R2MediaStorageProvider } from "./r2";

export * from "./types";

export function getMediaStorageProvider(): MediaStorageProvider {
  const providerName = process.env.MEDIA_STORAGE_PROVIDER ?? "stub";

  switch (providerName) {
    case "stub":
      return new StubMediaStorageProvider();
    case "r2":
      return new R2MediaStorageProvider();
    default:
      throw new Error(
        `Unknown MEDIA_STORAGE_PROVIDER "${providerName}". Register an implementation in src/lib/providers/storage/index.ts.`
      );
  }
}
