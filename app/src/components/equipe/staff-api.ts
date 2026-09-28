// Client for /api/equipe/staff/* (#554). Every staff action goes through
// POST /api/equipe/staff/commands with { type, payload, role, workspaceId,
// accountId }; reads use the staff GETs only. No business rules here:
// states, precedence, gates and permissions come from the API.

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { StaffRole } from "./types";

export class StaffApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "StaffApiError";
    this.status = status;
    this.code = code;
  }
}

type ErrorEnvelope = {
  error?: unknown;
  code?: unknown;
  details?: unknown;
};

export async function staffFetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (res.ok) return (await res.json()) as T;
  throw await toStaffApiError(res);
}

async function toStaffApiError(res: Response): Promise<StaffApiError> {
  let code: string | null = null;
  let message = `request failed (${res.status})`;
  try {
    const body = (await res.json()) as ErrorEnvelope;
    if (typeof body.code === "string") code = body.code;
    if (typeof body.error === "string" && body.error.length > 0) message = body.error;
  } catch {
    // Non-JSON error: keep the status fallback.
  }
  return new StaffApiError(res.status, code, message);
}

export type StaffCommandInput = {
  type: string;
  payload: Record<string, unknown>;
  role: StaffRole;
  // Account scope; absent only for the platform-wide global stop (#583).
  workspaceId?: string;
  /** Absent for open_account — the account does not exist yet (#582). */
  accountId?: string;
};

export async function sendStaffCommand<T = Record<string, unknown>>(
  input: StaffCommandInput,
): Promise<T> {
  const res = await apiFetch("/api/equipe/staff/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) return (await res.json()) as T;
  throw await toStaffApiError(res);
}

// The role each command needs, mirroring the module's authorize matrix:
// exceptions are support's, calibration is quality's, technical resolution
// and revocation are operations'. Always sent explicitly so multi-role
// staff never hit the ambiguous-actor 400.
export const STAFF_ROLE_FOR_COMMAND: Record<string, StaffRole> = {
  assume_exception: "support",
  post_staff_message: "support",
  register_contact: "support",
  close_exception: "support",
  score_attempt: "quality",
  return_item_for_fix: "quality",
  release_item_to_client: "quality",
  mark_critical_failure: "quality",
  classify_rejection: "quality",
  close_round: "quality",
  resolve_content_escalation: "quality",
  resolve_technical_escalation: "operations",
  reopen_front_calibration: "quality",
  revoke_connection: "operations",
  record_quality_effort: "quality",
  // #582 — opening an account is operations'.
  open_account: "operations",
  // #584: support or operations may propose; the accounts console sends
  // the caller's held role down, this entry stays the API-direct default.
  propose_mandate_activation: "support",
  // #583 — the global stop is platform-wide and operations-only.
  stop_all_publications: "operations",
  resume_all_publications: "operations",
};

/** close_escalation: only the escalation's owner role closes it. */
export function roleForCloseEscalation(ownerRole: string): StaffRole {
  return ownerRole === "operations" ? "operations" : "quality";
}

/**
 * resume_pause: who resumes depends on the pause origin (client and
 * automatic origins are not staff-resumable at all). A team pause needs
 * the same person back — the API checks identity and says so on 403.
 */
export function roleForResumePause(origin: string): StaffRole | null {
  switch (origin) {
    case "content_incident":
      return "quality";
    case "global_stop":
    case "security":
      return "operations";
    case "team":
      return "support";
    default:
      return null;
  }
}

export function useStaffCommand<T = Record<string, unknown>>(options?: {
  invalidateQueries?: Array<readonly unknown[]>;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StaffCommandInput) => sendStaffCommand<T>(input),
    onSuccess: () => {
      for (const queryKey of options?.invalidateQueries ?? []) {
        void queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
      }
    },
  });
}
