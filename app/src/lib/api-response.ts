import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

export async function apiError(
  code: string,
  status: number,
  details?: unknown
) {
  const t = await getTranslations("errors");
  const message = (() => {
    try {
      const translate = t as unknown as (key: string) => string;
      return translate(code);
    } catch {
      return t("generic");
    }
  })();

  return NextResponse.json(
    { error: message, code, details },
    { status }
  );
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  return { message: String(error) };
}

export async function handleApiError(error: unknown, context: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return apiError("unauthorized", 401);
  }

  if (error instanceof Error && error.message === "No workspace") {
    return apiError("noWorkspace", 403);
  }

  if (error instanceof Error && error.message === "Forbidden") {
    return apiError("forbidden", 403);
  }

  if (error instanceof SyntaxError) {
    return apiError("invalidRequestBody", 400);
  }

  const errorId = crypto.randomUUID();
  const serialized = serializeError(error);
  logger.error("[api-error]", {
    errorId,
    context,
    error: serialized,
  });
  captureException(error, { errorId, context });

  return apiError("internalError", 500, {
    errorId,
    ...(process.env.NODE_ENV === "development" && { devError: serialized }),
  });
}
