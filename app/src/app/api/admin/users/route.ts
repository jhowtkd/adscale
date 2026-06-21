import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  searchAdminUsers,
  type AdminUserSearchParams,
} from "@/server/repositories/admin-users";

function parseSearchParams(url: URL): AdminUserSearchParams {
  const { searchParams } = url;

  return {
    search: searchParams.get("search") ?? undefined,
    page: Number(searchParams.get("page") ?? 1),
    pageSize: Number(searchParams.get("pageSize") ?? 20),
    active7d:
      searchParams.get("active7d") === "true" || searchParams.get("active") === "7d",
    creditsZero:
      searchParams.get("creditsZero") === "true" ||
      searchParams.get("credits") === "zero",
    onboardingIncomplete: searchParams.get("onboardingIncomplete") === "true",
    emailUnverified: searchParams.get("emailUnverified") === "true",
  };
}

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const params = parseSearchParams(new URL(request.url));
    const result = await searchAdminUsers(params);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "admin.users.GET");
  }
}
