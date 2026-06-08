import { NextResponse } from "next/server";

function getAllowedOrigins(): string[] {
  const raw = process.env.MARKETING_ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function corsMarketingHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
  }
  return {};
}

export function jsonWithCors(request: Request, body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsMarketingHeaders(request) });
}
