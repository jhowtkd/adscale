import { NextResponse } from "next/server";
import { corsMarketingHeaders, jsonWithCors } from "@/lib/cors-marketing";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsMarketingHeaders(request) });
}

export async function POST(request: Request) {
  return jsonWithCors(request, { error: "waitlist_closed" }, 410);
}
