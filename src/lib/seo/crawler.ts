/**
 * Detects well-known, legitimate search-engine crawler user-agents so
 * they can be let past the client-side 18+ AgeGate (src/components/
 * age-gate.tsx) — which otherwise blocks 100% of server-rendered
 * content on every page, for every visitor, unconditionally, since its
 * confirmation state only ever resolves inside a browser-only
 * useEffect. Every real human visitor's experience is completely
 * unaffected by this — same click-through gate, same localStorage
 * confirmation.
 *
 * This is a plain user-agent substring check, which is spoofable in
 * principle (any client can claim to be "Googlebot"). That's an
 * accepted tradeoff here, not an oversight: the only content this
 * bypass ever exposes is a creator's already-public profile shell and
 * public discovery/category listings — the exact same data any free,
 * anonymous account could already see once signed in. It never
 * exposes gated media, private account data, or anything a real
 * verification step protects. Stronger verification (e.g. reverse-DNS
 * checks against Google's published IP ranges) would be the right
 * move if this bypass ever started gating something more sensitive
 * than public marketing-surface content — it does not today.
 */
const KNOWN_CRAWLER_USER_AGENT_SUBSTRINGS = [
  "Googlebot",
  "Google-InspectionTool", // Google's Rich Results Test / URL Inspection tool
  "Bingbot",
  "DuckDuckBot",
  "Applebot",
  "YandexBot",
  "Baiduspider",
];

export function isKnownCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  // Case-insensitive: real crawlers aren't consistent about casing
  // (e.g. Bing sends "bingbot", lowercase, not "Bingbot").
  const lowered = userAgent.toLowerCase();
  return KNOWN_CRAWLER_USER_AGENT_SUBSTRINGS.some((substring) => lowered.includes(substring.toLowerCase()));
}
