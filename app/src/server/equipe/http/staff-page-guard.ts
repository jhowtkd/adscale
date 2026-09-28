// Server-side page guard for the internal Equipe consoles (#554).
//
// The admin pages have no page-level guard today (the API guards); the
// Equipe consoles keep that pattern but render only for internal staff:
// the same `equipeStaffContext` helper the staff API routes use decides,
// and anyone else gets `notFound()` — never a redirect that would reveal
// the consoles' existence.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { equipeStaffContext } from "./guards";

export async function requireEquipeStaffPage(): Promise<void> {
  const headerList = await headers();
  const request = new Request("https://adscale.internal/equipe", {
    headers: new Headers(headerList),
  });
  try {
    await equipeStaffContext(request);
  } catch {
    notFound();
  }
}
