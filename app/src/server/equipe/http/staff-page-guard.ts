// Server-side page guard for the internal Equipe consoles (#554).
//
// The admin pages have no page-level guard today (the API guards); the
// Equipe consoles keep that pattern but render only for internal staff:
// the same `equipeStaffContext` helper the staff API routes use decides,
// and anyone else gets `notFound()` — never a redirect that would reveal
// the consoles' existence.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { EquipeStaffMember } from "../data";
import { equipeStaffContext } from "./guards";

export async function requireEquipeStaffPage(): Promise<void> {
  await requireEquipeStaffPageContext();
}

// #582 — the guard above plus the caller's staff rows, for server
// components that vary by role (the open-account action needs
// operations). Same 404 for anyone else.
export async function requireEquipeStaffPageContext(): Promise<{
  staffRows: EquipeStaffMember[];
}> {
  const headerList = await headers();
  const request = new Request("https://adscale.internal/equipe", {
    headers: new Headers(headerList),
  });
  try {
    const guard = await equipeStaffContext(request);
    return { staffRows: guard.staffRows };
  } catch {
    notFound();
  }
}
