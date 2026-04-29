import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "adscale-app",
    timestamp: new Date().toISOString(),
  });
}
