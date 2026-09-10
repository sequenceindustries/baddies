import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { generateDisplayVariant, getImageDimensions } from "@/lib/media/image-pipeline";

async function synthesizeImage(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .jpeg()
    .toBuffer();
}

describe("image-pipeline", () => {
  it("caps a large image to the 2048 max long edge, encoded as WebP", async () => {
    const input = await synthesizeImage(3000, 2000);
    const variant = await generateDisplayVariant(input);
    expect(variant).not.toBeNull();
    expect(variant?.mimeType).toBe("image/webp");
    expect(Math.max(variant!.width, variant!.height)).toBe(2048);
    expect(variant!.width).toBeLessThanOrEqual(2048);
    expect(variant!.height).toBeLessThanOrEqual(2048);
  });

  it("does not upscale an image already smaller than the cap", async () => {
    const input = await synthesizeImage(400, 300);
    const variant = await generateDisplayVariant(input);
    expect(variant).not.toBeNull();
    expect(variant!.width).toBe(400);
    expect(variant!.height).toBe(300);
  });

  it("returns null for undecodable bytes rather than throwing", async () => {
    const garbage = Buffer.from("this is not an image, just plain text bytes");
    const variant = await generateDisplayVariant(garbage);
    expect(variant).toBeNull();
  });

  it("getImageDimensions reports real width/height for a valid image", async () => {
    const input = await synthesizeImage(640, 480);
    const dims = await getImageDimensions(input);
    expect(dims).toEqual({ width: 640, height: 480 });
  });

  it("getImageDimensions returns null for garbage bytes", async () => {
    const dims = await getImageDimensions(Buffer.from("not an image"));
    expect(dims).toBeNull();
  });
});
