import { NextResponse } from "next/server";
import { isBrandMemoryEnabled } from "@/server/memory/mem0-client";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "adscale-app",
    timestamp: new Date().toISOString(),
    brandMemory: {
      enabled: isBrandMemoryEnabled(),
    },
  });
}
