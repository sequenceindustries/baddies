import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/", "/login", "/founding-baddies"]);

const PUBLIC_PREFIXES = [
  "/api/founding-baddies",
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
    if (claims?.role === "ADMIN") {
      return NextResponse.next();
    }
  }

const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
