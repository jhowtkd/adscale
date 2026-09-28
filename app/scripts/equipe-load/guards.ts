// Safety guards for the Equipe load harness (#555).
//
// Pure functions (no imports from src/) so the unit test runs without env.
// Rules:
// - NODE_ENV=production always refuses.
// - Any database name/host that looks like production always refuses.
// - `local` (default) only runs against a throwaway-looking database name.
// - `staging` additionally requires --target staging AND --i-know-this-writes
//   plus a staging-looking database name or host.

export type LoadTarget = "local" | "staging";

export type GuardInput = {
  target: LoadTarget;
  databaseUrl: string;
  iKnowThisWrites: boolean;
  nodeEnv: string | undefined;
};

const PROD_PATTERN = /(^|[^a-z])prod([^a-z]|$)|production/i;
const LOCAL_PATTERN = /load|test|local/i;
const STAGING_PATTERN = /stag|stg/i;

export function databaseNameOf(databaseUrl: string): string {
  const pathname = new URL(databaseUrl).pathname;
  const segments = pathname.split("/").filter(Boolean);
  return segments[0] ?? "";
}

export function hostOf(databaseUrl: string): string {
  return new URL(databaseUrl).hostname;
}

function looksProd(value: string): boolean {
  return PROD_PATTERN.test(value);
}

/**
 * Throws when the run is not allowed to write to the database.
 * Returns the database name for logging when it is allowed.
 */
export function assertSafeToWrite(input: GuardInput): string {
  if (input.nodeEnv === "production") {
    throw new Error("equipe-load refuses to run with NODE_ENV=production");
  }
  let name: string;
  let host: string;
  try {
    name = databaseNameOf(input.databaseUrl);
    host = hostOf(input.databaseUrl);
  } catch {
    throw new Error("equipe-load needs a valid --database-url");
  }
  if (!name) {
    throw new Error("equipe-load needs a --database-url with a database name");
  }
  if (looksProd(name) || looksProd(host)) {
    throw new Error(
      `equipe-load refuses the production-looking database "${name}" on host "${host}"`,
    );
  }
  if (input.target === "staging") {
    if (!input.iKnowThisWrites) {
      throw new Error("staging runs require --target staging --i-know-this-writes");
    }
    if (!STAGING_PATTERN.test(name) && !STAGING_PATTERN.test(host)) {
      throw new Error(
        `staging runs require a staging-looking database (got "${name}" on "${host}")`,
      );
    }
    return name;
  }
  if (!LOCAL_PATTERN.test(name)) {
    throw new Error(
      `local runs require a throwaway-looking database name (*load*, *test*, *local*; got "${name}")`,
    );
  }
  return name;
}
