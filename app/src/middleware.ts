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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit API mutations
  if (isApiMutation(request)) {
    const category = pathname.startsWith("/api/auth")
      ? "auth"
      : pathname.startsWith("/api/briefing-doctor") ||
        pathname.startsWith("/api/campaigns") ||
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

  // Auth protection for frontend routes
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie =
    request.cookies.get("better-auth.session_token")?.value ??
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  if (!sessionCookie) {
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
