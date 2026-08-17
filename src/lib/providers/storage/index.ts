import type { MediaStorageProvider } from "./types";
import { StubMediaStorageProvider } from "./stub";

export * from "./types";

export function getMediaStorageProvider(): MediaStorageProvider {
  const providerName = process.env.MEDIA_STORAGE_PROVIDER ?? "stub";

  switch (providerName) {
    case "stub":
      return new StubMediaStorageProvider();
    default:
      throw new Error(
        `Unknown MEDIA_STORAGE_PROVIDER "${providerName}". Register an implementation in src/lib/providers/storage/index.ts.`
      );
  }
}
