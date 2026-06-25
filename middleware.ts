import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifySessionToken,
  createSessionToken,
  COOKIE_NAME,
  COOKIE_MAX_AGE,
} from "./lib/auth";
import type { SessionUser } from "./lib/types";

// Sliding refresh: re-issue the session cookie with a fresh expiry so an active
// user is kept signed in indefinitely. Skipped for /api calls (e.g. the 30s Live
// poll) so we only refresh on real navigation, not background traffic.
async function withSlidingSession(
  res: NextResponse,
  user: SessionUser,
  pathname: string
): Promise<NextResponse> {
  if (pathname.startsWith("/api")) return res;
  const token = await createSessionToken(user);
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    pathname === "/privacy" || // public: linked from A2P 10DLC campaign registration
    pathname === "/terms" ||
    pathname === "/sms" || // public: SMS opt-in / Call-to-Action form
    pathname === "/signup" || // legacy alias → redirects to /sms
    pathname.startsWith("/track/") || // public: tokenized customer delivery tracker
    pathname === "/sw.js" || // service worker must be fetchable before auth
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/signups") ||
    pathname.startsWith("/api/sms") || // Twilio webhook: validated by signature, not cookie

    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/manifest.json" ||
    // Only top-level static assets (PWA icons) skip auth - a bare "endsWith"
    // check would also expose any future API route named *.png.
    (/\.(png|svg|ico)$/.test(pathname) && !pathname.slice(1).includes("/"))
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(COOKIE_NAME);
  if (!session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const user = await verifySessionToken(session.value);
  if (!user) {
    const res = NextResponse.redirect(new URL("/", request.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  if (pathname.startsWith("/driver") && (user.role === "dispatcher" || user.role === "admin")) {
    return withSlidingSession(NextResponse.next(), user, pathname);
  }
  if (
    (pathname.startsWith("/dispatch") ||
      pathname.startsWith("/sales") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/owner")) &&
    user.role === "driver"
  ) {
    return withSlidingSession(
      NextResponse.redirect(new URL("/driver", request.url)),
      user,
      pathname
    );
  }

  const res = NextResponse.next();
  res.headers.set("x-user-id", user.id);
  res.headers.set("x-user-role", user.role);
  res.headers.set("x-user-name", user.name);
  return withSlidingSession(res, user, pathname);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png).*)",
  ],
};
