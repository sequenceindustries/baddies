import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, revokeSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
    const cookieName = process.env.SESSION_COOKIE_NAME ?? "baddies_session";
    const cookieStore = cookies();
    const token = cookieStore.get(cookieName)?.value;

  if (token) {
        const claims = await verifySessionToken(token);
        if (claims) {
                await revokeSession(claims.sid);
        }
  }

  const response = NextResponse.json({ loggedOut: true });
    response.cookies.set(cookieName, "", { maxAge: 0, path: "/" });
    return response;
}
