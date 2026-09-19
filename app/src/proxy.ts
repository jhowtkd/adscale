import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getMutationRateLimitCategory } from "@/lib/api-rate-limit-category";
import { rateLimit } from "@/lib/rate-limit";
import { isValidLocale, defaultLocale } from "@/i18n/config";
import { logger } from "@/lib/logger";
import { hasStudioResumeQuery } from "@/lib/studio-resume-query";

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
  } catch (err) {
    logger.error("[proxy] invalid MARKETING_URL env var", { raw, error: err });
    return null;
  }
}

function redirectUnauthenticated(request: NextRequest, pathname: string) {
  const resumePath = `${pathname}${request.nextUrl.search}`;
  const studioResume = pathname === "/" && hasStudioResumeQuery(request.nextUrl.searchParams);
  const marketingUrl = getMarketingUrl();
  if (pathname === "/" && marketingUrl && !studioResume) {
    return NextResponse.redirect(marketingUrl);
  }

  const loginUrl = new URL("/login", request.url);
  if (resumePath !== "/") {
    loginUrl.searchParams.set("callbackUrl", resumePath);
  }
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit API mutations
  if (isApiMutation(request)) {
    const category = getMutationRateLimitCategory(pathname);

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

  // No cookie-only shortcut here: a stale or forged cookie is not proof of a
  // session. Authenticated users skip entry screens inside the auth pages,
  // after real session verification that also preserves the callback.
  const response = NextResponse.next();

  if (isAuthEntryPath(pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

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
