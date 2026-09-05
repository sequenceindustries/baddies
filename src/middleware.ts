import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

// /partner-invite must be reachable pre-launch, same as /founding-baddies —
// it's how an invited Founding Partner (who has no account yet) accepts.
const PUBLIC_PATHS = new Set(["/", "/login", "/founding-baddies", "/partner-invite"]);

const PUBLIC_PREFIXES = [
  "/api/founding/apply",
  "/api/founding/referral", // sets the referral-attribution cookie from /founding-baddies?ref=<code>, called before the visitor has any account
  "/api/partner-invite", // status + accept — an invited partner has no session yet either
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  ];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest) {
  if (process.env.LAUNCH_MODE !== "coming_soon") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const cookieName = process.env.SESSION_COOKIE_NAME ?? "baddies_session";
  const token = req.cookies.get(cookieName)?.value;
  if (token) {
    const claims = await verifySessionToken(token);
    // A Founding Partner's dashboard is private and invite-only by
    // construction (see PartnerInvitation) — it's reachable pre-launch
    // for the same reason an admin is, not a general public surface.
    if (claims?.role === "ADMIN" || claims?.role === "PARTNER") {
      return NextResponse.next();
    }
  }

  // API routes have their own callers (fetch().then(r => r.json())), not a
  // browser address bar — sending them the page-navigation redirect/rewrite
  // below would hand them an HTML document where they expect JSON, which
  // throws the exact same "Unexpected token '<' ... is not valid JSON" this
  // gate is otherwise being fixed to avoid. Answer them in kind instead.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Next.js's client router fetches gated routes in the background when a
  // <Link> is prefetched or clicked (tagged with a "next-url" header),
  // expecting a flight-formatted response back. A 3xx from middleware
  // breaks that: fetch() follows the redirect transparently, but the
  // follow-up request still carries that header describing the *original*
  // destination, so the server can't reconcile it against "/" and falls
  // back to a full HTML document — which the router then fails to parse as
  // flight data ("Unexpected token '<' ... is not valid JSON"), silently
  // aborting the navigation (URL never changes, nothing happens).
  //
  // A rewrite sidesteps this entirely: it's served in the same
  // request/response cycle, so there's no second, header-mismatched fetch
  // for the router to choke on. Its query string (the router's "_rsc" cache
  // key) has to be kept intact, or Next stops recognizing the request as a
  // flight fetch and serves a full document again. Real document requests
  // (typed URL, refresh, opening in a new tab) don't carry the "next-url"
  // header and keep getting a normal redirect so the address bar lands on
  // "/", with no query string to carry over.
  if (req.headers.has("next-url")) {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = "/";
    return NextResponse.rewrite(rewriteUrl);
  }

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = "/";
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  // The trailing extension exclusion covers static files served straight
  // out of public/ (hero-banner.jpg and anything added there later) —
  // without it, the gate redirects those requests too (found via
  // /hero-banner.jpg 307-ing to "/" on the live coming-soon site, which
  // is exactly why the hero banner's background image wasn't showing).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|woff|woff2|ttf|map)$).*)",
  ],
};
