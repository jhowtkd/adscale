import type { DerivationGenerationLog } from "./generation-log";
import type { CreativeHardFailure } from "./creative-quality-gate";
import { normalizeHardFailureCode } from "./creative-quality-gate";

export interface DerivationAutoRetryApiFields {
  autoRetryAttempted?: boolean;
  autoRetryReason?: string | null;
}

export function extractAutoRetryFields(
  generationLog: unknown
): DerivationAutoRetryApiFields {
  if (!generationLog || typeof generationLog !== "object") {
    return {};
  }

  const log = generationLog as Partial<DerivationGenerationLog>;
  const fields: DerivationAutoRetryApiFields = {};

  if (typeof log.autoRetryAttempted === "boolean") {
    fields.autoRetryAttempted = log.autoRetryAttempted;
  }
  if (log.autoRetryReason !== undefined) {
    fields.autoRetryReason = log.autoRetryReason ?? null;
  }

  return fields;
}

export type AutoRetryOutcome = "succeeded" | "unchanged";

export function classifyAutoRetryOutcome(
  preRetryFailureCodes: string[],
  postRetryFailures: CreativeHardFailure[] | null | undefined
): AutoRetryOutcome {
  if (preRetryFailureCodes.length === 0) {
    return "unchanged";
  }

  const postCodes = new Set(
    (postRetryFailures ?? []).map((failure) =>
      normalizeHardFailureCode(failure.code)
    )
  );

  const stillPresent = preRetryFailureCodes.some((code) =>
    postCodes.has(normalizeHardFailureCode(code))
  );

  return stillPresent ? "unchanged" : "succeeded";
}

type DerivationRowWithGenerationLog = Record<string, unknown> & {
  generationLog?: unknown;
};

export function serializeDerivationForApi<T extends DerivationRowWithGenerationLog>(
  row: T
): Omit<T, "generationLog"> & DerivationAutoRetryApiFields {
  const { generationLog, ...rest } = row;
  return {
    ...rest,
    ...extractAutoRetryFields(generationLog),
  };
}
