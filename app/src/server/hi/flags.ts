/**
 * Public home (`/hi`) feature flags (#439). Pure parsing/resolution — no Next
 * imports, safe to load from `next.config.ts` at build time.
 *
 * - `HI_IMPORT_ENABLED`: authenticated import path (#442/#443) is live.
 * - `HI_PAGE_ENABLED`: interactive visitor island (#440) renders instead of
 *   the local fallback.
 * - `HI_ATTACHMENTS_ENABLED`: reference attachments (#444) accepted.
 *
 * Consistency rule: the page or attachments must never be enabled without
 * the import path — a page collecting drafts with no import strands visitors.
 * Invalid combinations fail the build (see `next.config.ts`).
 */

export interface HiFlags {
  importEnabled: boolean;
  pageEnabled: boolean;
  attachmentsEnabled: boolean;
}

export interface HiFlagResolution {
  flags: HiFlags;
  errors: string[];
}

const TRUE = "true";
const FALSE = "false";

function parseFlag(
  raw: string | undefined,
  name: string,
  errors: string[],
): boolean {
  const value = (raw ?? FALSE).trim();
  if (value === TRUE) return true;
  if (value === FALSE) return false;
  errors.push(
    `${name} must be "true" or "false", got ${JSON.stringify(raw)}`,
  );
  return false;
}

export function resolveHiFlags(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): HiFlagResolution {
  const errors: string[] = [];
  const flags: HiFlags = {
    importEnabled: parseFlag(env.HI_IMPORT_ENABLED, "HI_IMPORT_ENABLED", errors),
    pageEnabled: parseFlag(env.HI_PAGE_ENABLED, "HI_PAGE_ENABLED", errors),
    attachmentsEnabled: parseFlag(
      env.HI_ATTACHMENTS_ENABLED,
      "HI_ATTACHMENTS_ENABLED",
      errors,
    ),
  };
  if (!flags.importEnabled && flags.pageEnabled) {
    errors.push(
      "HI_PAGE_ENABLED=true requires HI_IMPORT_ENABLED=true (page without import strands visitors)",
    );
  }
  if (!flags.importEnabled && flags.attachmentsEnabled) {
    errors.push(
      "HI_ATTACHMENTS_ENABLED=true requires HI_IMPORT_ENABLED=true (attachments without import strands visitors)",
    );
  }
  return { flags, errors };
}

export function assertHiFlagsValid(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): HiFlags {
  const { flags, errors } = resolveHiFlags(env);
  if (errors.length > 0) {
    throw new Error(`Invalid /hi flag combination: ${errors.join("; ")}`);
  }
  return flags;
}
