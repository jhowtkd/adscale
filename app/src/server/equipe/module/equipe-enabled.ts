// Workspace gate for the Equipe pilot: EQUIPE_ENABLED + allowlist.
//
// Fails closed, and unlike the quality pilot an EMPTY allowlist means
// nobody (the Equipe must never leak into workspaces by default). Mirrors
// parsePilotAllowlist from creative-work/quality-policy.ts without importing
// it, to keep this module decoupled from the creative-work contracts.

import type { InternalEquipeRepositories } from "../data";
import { env } from "../../validation/env";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) return [];
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const entry of entries) {
    if (entry !== "*" && !UUID_PATTERN.test(entry)) {
      throw new Error(`invalid_pilot_allowlist:${entry}`);
    }
  }
  return entries;
}

export type EquipeEnabledOverrides = {
  enabledRaw?: string | undefined;
  allowlistRaw?: string | undefined;
};

// #582 — the pilot workspace ids for the internal open-account form.
// Fails closed like the check below: disabled, empty or malformed
// allowlist reads as no workspace.
export function listPilotWorkspaceIds(overrides?: EquipeEnabledOverrides): string[] {
  const enabledRaw = overrides?.enabledRaw ?? env.EQUIPE_ENABLED;
  if (enabledRaw !== "true") return [];
  try {
    return [...new Set(parseAllowlist(overrides?.allowlistRaw ?? env.EQUIPE_PILOT_WORKSPACES))].filter((id) => id !== "*");
  } catch {
    return [];
  }
}

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
  return UUID_PATTERN.test(workspaceId) && (allowlist.includes("*") || allowlist.includes(workspaceId));
}

/** Preserve the paid Operations form when the pilot opens to all workspaces. */
export async function listPilotWorkspaceIdsForOpening(
  internal: Pick<InternalEquipeRepositories, "listWorkspaceIds">, overrides?: EquipeEnabledOverrides,
): Promise<string[]> {
  if ((overrides?.enabledRaw ?? env.EQUIPE_ENABLED) !== "true") return [];
  let entries: string[];
  try { entries = parseAllowlist(overrides?.allowlistRaw ?? env.EQUIPE_PILOT_WORKSPACES); }
  catch { return []; }
  return entries.includes("*") ? internal.listWorkspaceIds() : [...new Set(entries)];
}
