import { NextResponse } from "next/server";

export function GET() {
  const buildId =
    process.env.RENDER_GIT_COMMIT ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.BUILD_ID ??
    "development";

  return NextResponse.json({ buildId });
}
