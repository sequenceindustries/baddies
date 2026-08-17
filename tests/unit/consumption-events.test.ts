import { describe, it, expect } from "vitest";
import { isQualifiedConsumption } from "@/lib/entitlements/consumption-events";

describe("isQualifiedConsumption", () => {
  it("rejects a bare page impression (0 second engagement)", () => {
    expect(
      isQualifiedConsumption({
        fanId: "fan_1",
        contentId: "content_1",
        unlimitedSubscriptionId: "unl_1",
        mediaType: "VIDEO",
        engagedDurationSeconds: 0,
      })
    ).toBe(false);
  });

  it("rejects a video watched for only 2 seconds", () => {
    expect(
      isQualifiedConsumption({
        fanId: "fan_1",
        contentId: "content_1",
        unlimitedSubscriptionId: "unl_1",
        mediaType: "VIDEO",
        engagedDurationSeconds: 2,
      })
    ).toBe(false);
  });

  it("accepts a video watched for 10+ seconds", () => {
    expect(
      isQualifiedConsumption({
        fanId: "fan_1",
        contentId: "content_1",
        unlimitedSubscriptionId: "unl_1",
        mediaType: "VIDEO",
        engagedDurationSeconds: 12,
      })
    ).toBe(true);
  });

  it("accepts an image viewed for 3+ seconds", () => {
    expect(
      isQualifiedConsumption({
        fanId: "fan_1",
        contentId: "content_1",
        unlimitedSubscriptionId: "unl_1",
        mediaType: "IMAGE",
        engagedDurationSeconds: 4,
      })
    ).toBe(true);
  });

  it("rejects an image viewed for 1 second", () => {
    expect(
      isQualifiedConsumption({
        fanId: "fan_1",
        contentId: "content_1",
        unlimitedSubscriptionId: "unl_1",
        mediaType: "IMAGE",
        engagedDurationSeconds: 1,
      })
    ).toBe(false);
  });
});
