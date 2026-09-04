import { describe, it, expect } from "vitest";
import { maskAccountNumber } from "@/lib/security/mask";

describe("maskAccountNumber", () => {
  it("keeps the last 4 characters and bullets the rest", () => {
    expect(maskAccountNumber("1234567890")).toBe("••••••7890");
  });

  it("bullets a shorter-but-still-maskable number correctly", () => {
    expect(maskAccountNumber("123456")).toBe("••3456");
  });

  it("returns short input unmasked rather than an all-bullet string", () => {
    expect(maskAccountNumber("1234")).toBe("1234");
    expect(maskAccountNumber("12")).toBe("12");
    expect(maskAccountNumber("")).toBe("");
  });
});
