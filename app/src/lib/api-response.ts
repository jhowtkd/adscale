import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

export async function apiError(
  code: string,
  status: number,
  details?: unknown
) {
  const t = await getTranslations("errors");
  return NextResponse.json(
    { error: t(code as any) || t("generic"), code, details },
    { status }
  );
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
