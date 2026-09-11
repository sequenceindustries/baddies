import { describe, it, expect } from "vitest";
import { isKnownCrawlerUserAgent } from "@/lib/seo/crawler";

// SEO Phase 1 — see src/lib/seo/crawler.ts's own doc comment for why
// this is a plain UA substring check (accepted, low-stakes tradeoff:
// it only ever unlocks the same public profile/discovery content a
// free anonymous signup could already see, never gated media).
describe("isKnownCrawlerUserAgent", () => {
  const realWorldCrawlerUserAgents: Record<string, string> = {
    Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Google-InspectionTool":
      "Mozilla/5.0 (compatible; Google-InspectionTool/1.0; +https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers)",
    Bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    DuckDuckBot: "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
    Applebot: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (Applebot/0.1)",
    YandexBot: "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    Baiduspider: "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
  };

  it.each(Object.entries(realWorldCrawlerUserAgents))(
    "recognizes a real-world %s user-agent string",
    (_name, ua) => {
      expect(isKnownCrawlerUserAgent(ua)).toBe(true);
    }
  );

  it("returns false for a normal browser user-agent", () => {
    const chromeUa =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(isKnownCrawlerUserAgent(chromeUa)).toBe(false);
  });

  it("returns false for null, undefined, and an empty string", () => {
    expect(isKnownCrawlerUserAgent(null)).toBe(false);
    expect(isKnownCrawlerUserAgent(undefined)).toBe(false);
    expect(isKnownCrawlerUserAgent("")).toBe(false);
  });

  it("does not false-positive on a UA that merely mentions a bot-adjacent word", () => {
    // Guards against an overly broad match (e.g. a naive /bot/i regex
    // would wrongly catch this) — the real allowlist is exact-substring
    // against specific crawler product tokens, not a generic "bot" scan.
    expect(isKnownCrawlerUserAgent("Mozilla/5.0 SomeRandomAbbottBrowser/1.0")).toBe(false);
  });
});
