import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { isValidLocale, defaultLocale } from "@/i18n/config";

const PROTECTED_PREFIXES = ["/campaigns", "/settings"];
const PROTECTED_EXACT = ["/"];
const AUTH_ENTRY_PATHS = ["/login", "/signup"];

function isProtectedPath(pathname: string): boolean {
  if (PROTECTED_EXACT.includes(pathname)) return true;
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAuthEntryPath(pathname: string): boolean {
  return AUTH_ENTRY_PATHS.includes(pathname);
}

function isApiMutation(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;
  return ["POST", "PATCH", "PUT", "DELETE"].includes(request.method);
}

function getLocaleFromRequest(request: NextRequest): string {
  const cookieLocale = request.cookies.get("locale")?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return cookieLocale;
  }

  const acceptLanguage = request.headers.get("accept-language");
  const browserLocale = acceptLanguage?.split(",")[0]?.split("-")[0];
  if (browserLocale === "pt") return "pt-BR";

  return defaultLocale;
}

function hasSessionCookie(request: NextRequest): boolean {
  return (
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token") ||
    request.cookies.has("session")
  );
}

function getMarketingUrl(): string | null {
  const raw = process.env.MARKETING_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/$/, "");
    return path ? `${url.origin}${path}` : url.origin;
  } catch {
    return null;
  }
}

function redirectUnauthenticated(request: NextRequest, pathname: string) {
  const marketingUrl = getMarketingUrl();
  if (pathname === "/" && marketingUrl) {
    return NextResponse.redirect(marketingUrl);
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit API mutations
  if (isApiMutation(request)) {
    const category = pathname.startsWith("/api/auth")
      ? "auth"
      : pathname.includes("/assets/upload")
      ? "general"
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

  // Skip API and static files for locale/auth handling
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const locale = getLocaleFromRequest(request);
  const session = hasSessionCookie(request);

  // Logged-in users skip auth entry screens
  if (session && isAuthEntryPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();

  if (!request.cookies.get("locale")?.value) {
    response.cookies.set("locale", locale, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  if (!isProtectedPath(pathname)) {
    return response;
  }

  if (!session) {
    return redirectUnauthenticated(request, pathname);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
