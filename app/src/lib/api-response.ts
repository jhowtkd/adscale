import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { AUTH_ERROR_CODES, isWorkspaceAuthError } from "@/server/auth/errors";

export async function apiError(
  code: string,
  status: number,
  details?: unknown
) {
  const t = await getTranslations("errors");
  const message = resolveErrorMessage(t, code);

  return NextResponse.json(
    { error: message, code, details },
    { status }
  );
}

/**
 * Resolves an i18n error message for `code`, falling back to `errors.generic`
 * (then `errors.unknown`) when the key is missing so a raw `errors.<code>` path
 * never leaks to clients. `next-intl` returns the requested key path verbatim
 * when the key is absent, so we detect that and substitute a safe default.
 */
function resolveErrorMessage(
  t: Awaited<ReturnType<typeof getTranslations<"errors">>>,
  code: string
): string {
  const translate = t as unknown as (key: string) => string;
  const tryKey = (key: string): string | null => {
    try {
      const value = translate(key);
      if (!value || value === key || value === `errors.${key}`) return null;
      return value;
    } catch {
      return null;
    }
  };

  return tryKey(code) ?? tryKey("generic") ?? tryKey("unknown") ?? "Unknown error";
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

function isDatabaseConnectionError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  const connectionCodes = new Set([
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ECONNRESET",
    "57P01",
    "53300",
  ]);
  if (code && connectionCodes.has(code)) return true;
  return /connect ECONNREFUSED|Connection terminated|timeout expired/i.test(
    error.message
  );
}

export async function handleApiError(error: unknown, context: string) {
  if (isWorkspaceAuthError(error)) {
    switch (error.code) {
      case AUTH_ERROR_CODES.unauthorized:
        return apiError("unauthorized", 401);
      case AUTH_ERROR_CODES.noWorkspace:
        return apiError("noWorkspace", 403);
      case AUTH_ERROR_CODES.forbidden:
        return apiError("forbidden", 403);
    }
  }

  if (error instanceof SyntaxError) {
    return apiError("invalidRequestBody", 400);
  }

  if (isDatabaseConnectionError(error)) {
    return apiError("internalError", 503);
  }

  const errorId = crypto.randomUUID();
  const serialized = serializeError(error);
  const sentryError =
    error instanceof Error ? error : new Error(typeof serialized.message === "string" ? serialized.message : "API error");

  captureException(sentryError, {
    errorId,
    context,
    error: serialized,
    source: "handleApiError",
  });
  logger.error("[api-error]", { errorId, context, error: serialized });

  return apiError("internalError", 500, {
    errorId,
    ...(process.env.NODE_ENV === "development" && { devError: serialized }),
  });
}
