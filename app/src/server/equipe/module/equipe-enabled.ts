// Workspace gate for the Equipe pilot: EQUIPE_ENABLED + allowlist.
//
// Fails closed, and unlike the quality pilot an EMPTY allowlist means
// nobody (the Equipe must never leak into workspaces by default). Mirrors
// parsePilotAllowlist from creative-work/quality-policy.ts without importing
// it, to keep this module decoupled from the creative-work contracts.

import { env } from "../../validation/env";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) return [];
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const entry of entries) {
    if (!UUID_PATTERN.test(entry)) {
      throw new Error(`invalid_pilot_allowlist:${entry}`);
    }
  }
  return entries;
}

export type EquipeEnabledOverrides = {
  enabledRaw?: string | undefined;
  allowlistRaw?: string | undefined;
};

export function isEquipeEnabledForWorkspace(
  workspaceId: string,
  overrides?: EquipeEnabledOverrides,
): boolean {
  const enabledRaw = overrides?.enabledRaw ?? env.EQUIPE_ENABLED;
  if (enabledRaw !== "true") return false;
  let allowlist: string[];
  try {
    allowlist = parseAllowlist(overrides?.allowlistRaw ?? env.EQUIPE_PILOT_WORKSPACES);
  } catch {
    return false;
  }
  if (allowlist.length === 0) return false;
  return allowlist.includes(workspaceId);
}
