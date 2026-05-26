import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

const PROTECTED_PREFIXES = ["/campaigns", "/settings"];
const PROTECTED_EXACT = ["/"];

function isProtectedPath(pathname: string): boolean {
  if (PROTECTED_EXACT.includes(pathname)) return true;
  return PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isApiMutation(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;
  return ["POST", "PATCH", "PUT", "DELETE"].includes(request.method);
}

/**
 * Check for session cookie presence without validating against the database.
 * Actual session validation happens in server components (Node.js runtime).
 * This avoids importing pg/crypto into the Edge runtime.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.has("better-auth.session_token") || request.cookies.has("session");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit API mutations
  if (isApiMutation(request)) {
    const category = pathname.startsWith("/api/auth")
      ? "auth"
      : pathname.startsWith("/api/campaigns") ||
        pathname.startsWith("/api/derivations") ||
        pathname.startsWith("/api/restyling") ||
        pathname.startsWith("/api/quick-tools")
      ? "ai"
      : "general";

    const result = await rateLimit(request, category);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "rateLimitExceeded",
          message: "Too many requests. Please try again later.",
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
          },
        }
      );
    }
  }

  // Auth protection for frontend routes — check cookie presence only
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
