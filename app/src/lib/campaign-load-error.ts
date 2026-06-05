export type CampaignLoadErrorKind =
  | "session"
  | "workspace"
  | "not_found"
  | "timeout"
  | "server"
  | "unknown";

export type DerivationLoadErrorKind = CampaignLoadErrorKind;

export class CampaignLoadError extends Error {
  readonly kind: CampaignLoadErrorKind;
  readonly code?: string;
  readonly status?: number;

  constructor(
    message: string,
    input: {
      kind: CampaignLoadErrorKind;
      code?: string;
      status?: number;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "CampaignLoadError";
    this.kind = input.kind;
    this.code = input.code;
    this.status = input.status;
    if (input.cause instanceof Error) {
      this.cause = input.cause;
    }
  }
}

/** @deprecated use CampaignLoadError */
export type TypedLoadError = CampaignLoadError;

const WORKSPACE_CODES = new Set(["noWorkspace", "forbidden"]);
const NOT_FOUND_CODES = new Set(["campaignNotFound"]);
const SERVER_CODES = new Set(["internalError", "generationWorkerUnavailable"]);

export function classifyLoadError(input: {
  status?: number;
  code?: string;
  cause?: unknown;
}): CampaignLoadErrorKind {
  const { status, code, cause } = input;

  if (isTimeoutError(cause)) {
    return "timeout";
  }

  if (status === 401 || code === "unauthorized") {
    return "session";
  }

  if (status === 403 || (code && WORKSPACE_CODES.has(code))) {
    return "workspace";
  }

  if (status === 404 || (code && NOT_FOUND_CODES.has(code))) {
    return "not_found";
  }

  if (
    status === 500 ||
    status === 503 ||
    (code && SERVER_CODES.has(code))
  ) {
    return "server";
  }

  return "unknown";
}

function isTimeoutError(cause: unknown): boolean {
  if (!cause) return false;
  if (cause instanceof DOMException && cause.name === "TimeoutError") {
    return true;
  }
  if (cause instanceof Error) {
    if (cause.name === "AbortError" || cause.name === "TimeoutError") {
      return true;
    }
    if (/timed?\s*out|timeout|aborted/i.test(cause.message)) {
      return true;
    }
  }
  return false;
}

export function createLoadError(
  message: string,
  input: {
    status?: number;
    code?: string;
    cause?: unknown;
  }
): CampaignLoadError {
  const kind = classifyLoadError(input);
  return new CampaignLoadError(message, {
    kind,
    status: input.status,
    code: input.code,
    cause: input.cause,
  });
}

export function parseCampaignLoadError(
  res: Response,
  body: { error?: string; code?: string }
): CampaignLoadError {
  return createLoadError(body.error || "Failed to load campaign", {
    status: res.status,
    code: body.code,
  });
}

export function parseFetchFailure(error: unknown): CampaignLoadError {
  if (error instanceof CampaignLoadError) {
    return error;
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return new CampaignLoadError(error.message, { kind: "session" });
  }
  return createLoadError(
    error instanceof Error ? error.message : "Failed to load campaign",
    { cause: error }
  );
}

export function isLoadError(error: unknown): error is CampaignLoadError {
  return error instanceof CampaignLoadError;
}

export function getLoadErrorKind(error: unknown): CampaignLoadErrorKind {
  if (isLoadError(error)) {
    return error.kind;
  }
  if (error instanceof Error && isTimeoutError(error)) {
    return "timeout";
  }
  return "unknown";
}
