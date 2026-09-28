// Safety guard for scripts/equipe-seed-dev.ts. Deliberately dependency-free
// (no db, no env validation) so the unit test imports it hermetically.

export type SeedArgs = {
  workspace: string;
  clientProfile: string;
  user: string;
  staffUser: string;
  iKnowThisWrites: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse `npx tsx scripts/equipe-seed-dev.ts --workspace <id> ...`. */
export function parseSeedArgs(argv: string[]): SeedArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "i-know-this-writes") {
      flags.add(key);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`seed: missing value for --${key}`);
    }
    values[key] = next;
    i += 1;
  }
  for (const key of ["workspace", "client-profile", "user", "staff-user"] as const) {
    if (!values[key]) throw new Error(`seed: missing required --${key} <id>`);
  }
  for (const key of ["workspace", "client-profile"] as const) {
    if (!UUID_PATTERN.test(values[key]!)) throw new Error(`seed: --${key} must be a uuid`);
  }
  return {
    workspace: values["workspace"]!,
    clientProfile: values["client-profile"]!,
    user: values["user"]!,
    staffUser: values["staff-user"]!,
    iKnowThisWrites: flags.has("i-know-this-writes"),
  };
}

/** Database name out of a DATABASE_URL, or null when it cannot be told. */
export function databaseNameOf(databaseUrl: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(databaseUrl).pathname;
  } catch {
    return null;
  }
  const name = pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
  return name.length > 0 ? name : null;
}

const PRODUCTION_LOOKING = ["prod", "live"];

/**
 * Refuse to run unless NODE_ENV is non-production AND the database name is
 * not production-looking. Returns the database name for the run preamble.
 */
export function assertSeedTargetSafe(input: {
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
}): string {
  if (input.nodeEnv === "production") {
    throw new Error("seed: refusing to run with NODE_ENV=production");
  }
  if (!input.databaseUrl) {
    throw new Error("seed: refusing to run without DATABASE_URL");
  }
  const name = databaseNameOf(input.databaseUrl);
  if (!name) {
    throw new Error("seed: refusing to run, cannot tell the database name from DATABASE_URL");
  }
  const lowered = name.toLowerCase();
  if (PRODUCTION_LOOKING.some((marker) => lowered.includes(marker))) {
    throw new Error(`seed: refusing to run against production-looking database "${name}"`);
  }
  return name;
}

/** The explicit write flag is required — printing the plan is not enough. */
export function assertWriteFlagPresent(iKnowThisWrites: boolean): void {
  if (!iKnowThisWrites) {
    throw new Error("seed: refusing to write without --i-know-this-writes");
  }
}
