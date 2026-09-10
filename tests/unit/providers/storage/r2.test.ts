import { describe, it, expect, vi, beforeEach } from "vitest";

const sentCommands: unknown[] = [];
const capturedClientConfigs: Record<string, unknown>[] = [];

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
      capturedClientConfigs.push(config);
    }
    async send(command: unknown) {
      sentCommands.push(command);
      return {};
    }
  }
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
});

const getSignedUrlMock = vi.fn(async (_client: unknown, command: { input: { Key: string } }, opts: { expiresIn: number }) => {
  return `https://mock-signed.example/${command.input.Key}?expiresIn=${opts.expiresIn}`;
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: Parameters<typeof getSignedUrlMock>) => getSignedUrlMock(...args),
}));

describe("R2MediaStorageProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    sentCommands.length = 0;
    capturedClientConfigs.length = 0;
    getSignedUrlMock.mockClear();
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_BUCKET_NAME = "test-bucket";
    process.env.R2_ACCESS_KEY_ID = "test-key-id";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    process.env.R2_ENDPOINT = "https://test-account.r2.cloudflarestorage.com";
  });

  it("configures the S3 client with region 'auto' (R2's own requirement, not a real AWS region)", async () => {
    const { R2MediaStorageProvider } = await import("@/lib/providers/storage/r2");
    const provider = new R2MediaStorageProvider();
    await provider.putObject({ key: "some/key", contentType: "image/webp", body: Buffer.from("x") });
    expect(capturedClientConfigs[0]?.region).toBe("auto");
    expect(capturedClientConfigs[0]?.endpoint).toBe("https://test-account.r2.cloudflarestorage.com");
  });

  it("putObject round-trips the given key as storageKey", async () => {
    const { R2MediaStorageProvider } = await import("@/lib/providers/storage/r2");
    const provider = new R2MediaStorageProvider();
    const result = await provider.putObject({ key: "creators/abc/content/def", contentType: "image/webp", body: Buffer.from("x") });
    expect(result.storageKey).toBe("creators/abc/content/def");
  });

  it("clamps a requested TTL above the 7-day SigV4 ceiling", async () => {
    const { R2MediaStorageProvider } = await import("@/lib/providers/storage/r2");
    const provider = new R2MediaStorageProvider();
    await provider.getSignedReadUrl("some/key", 60 * 60 * 24 * 365); // 1 year requested
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const [, , opts] = getSignedUrlMock.mock.calls[0] as [unknown, unknown, { expiresIn: number }];
    expect(opts.expiresIn).toBe(60 * 60 * 24 * 7);
  });

  it("passes a TTL under the ceiling through unchanged", async () => {
    const { R2MediaStorageProvider } = await import("@/lib/providers/storage/r2");
    const provider = new R2MediaStorageProvider();
    await provider.getSignedReadUrl("some/key", 300);
    const [, , opts] = getSignedUrlMock.mock.calls[0] as [unknown, unknown, { expiresIn: number }];
    expect(opts.expiresIn).toBe(300);
  });

  it("deleteObject sends a DeleteObjectCommand for the given key", async () => {
    const { R2MediaStorageProvider } = await import("@/lib/providers/storage/r2");
    const provider = new R2MediaStorageProvider();
    await provider.deleteObject("some/key");
    expect(sentCommands).toHaveLength(1);
    expect((sentCommands[0] as { input: { Key: string; Bucket: string } }).input).toEqual({
      Key: "some/key",
      Bucket: "test-bucket",
    });
  });
});
