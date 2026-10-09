// The shell's two access probes for an ordinary account (ticket 13, D-11): the account menu and the mobile "Mais" sheet, with the REAL hooks and
// a stubbed network. Both probes answer 200 {allowed:false}: no staff or owner entry shows, each probe URL is asked once for the whole shell, and no answer is an error.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn(), useSession: () => ({ data: { user: { name: "Maria Souza", email: "maria@example.com" } } }) } }));
vi.mock("@/lib/store", () => ({ useAppStore: (selector: (s: { user: { firstName: string; lastName: string; email: string } }) => unknown) => selector({ user: { firstName: "Maria", lastName: "Souza", email: "maria@example.com" } }) }));

import AccountMenu from "./rail/AccountMenu";
import RailMobileNav from "./rail/RailMobileNav";

const STAFF_PROBE = "/api/equipe/staff/accounts?access=1";
const OWNER_PROBE = "/api/feedback/reports?access=1";
type Answer = { status: number; body: unknown };
const calls: string[] = [];
const answered: Array<{ url: string; status: number }> = [];

function stubNetwork(answers: Record<string, Answer>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const answer = answers[url] ?? { status: 404, body: { error: "unexpected request" } };
    answered.push({ url, status: answer.status });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }));
}
beforeEach(() => { calls.length = 0; answered.length = 0; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <QueryClientProvider client={qc}>
        <AccountMenu />
        <RailMobileNav />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
const nav = ptBR.navigation;
/** Opens the account menu, runs `inspect`, closes it, then does the same with the mobile "Mais" sheet (two modal layers cannot both be read at once). */
const eachSurface = async (inspect: (surface: "account menu" | "Mais sheet") => void | Promise<void>) => {
  fireEvent.click(screen.getByTestId("rail-account"));
  await screen.findByRole("menuitem", { name: nav.logout });
  await inspect("account menu");
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menuitem", { name: nav.logout })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /^Mais$/ }));
  await screen.findByText(nav.config);
  await inspect("Mais sheet");
};
const entries = () => [nav.feedback, nav.equipeExceptions, nav.equipeAccounts, nav.equipeQuality];

describe("the shell for an ordinary account", () => {
  it("both probes say {allowed:false}: no staff or owner entry anywhere, each probe asked once, nothing answered with an error", async () => {
    stubNetwork({ [STAFF_PROBE]: { status: 200, body: { allowed: false } }, [OWNER_PROBE]: { status: 200, body: { allowed: false } } });
    renderShell();
    await waitFor(() => expect(answered).toHaveLength(2));
    await new Promise(resolve => setTimeout(resolve, 30)); // Anything that was going to ask a second time would have by now.
    await eachSurface(surface => {
      for (const label of entries()) {
        expect(screen.queryByText(label), `${surface}: ${label}`).not.toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: label })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
      }
      expect(document.querySelector('a[href^="/admin/equipe"], a[href="/feedback"]'), surface).toBeNull();
    });
    expect(calls.filter(url => url === STAFF_PROBE)).toHaveLength(1);
    expect(calls.filter(url => url === OWNER_PROBE)).toHaveLength(1);
    expect(calls).toHaveLength(2); // Nothing else is asked: neither the pipeline nor the inbox.
    expect(answered.every(a => a.status < 400)).toBe(true);
  });

  it("control: when both probes say {allowed:true} the entries show, still one request each", async () => {
    stubNetwork({ [STAFF_PROBE]: { status: 200, body: { allowed: true } }, [OWNER_PROBE]: { status: 200, body: { allowed: true } } });
    renderShell();
    await waitFor(() => expect(answered).toHaveLength(2));
    await eachSurface(surface => waitFor(() => { // The answers reach the hooks a tick after the fetch returns.
      expect(document.querySelector('a[href="/feedback"]'), surface).not.toBeNull();
      expect(document.querySelector('a[href="/admin/equipe/accounts"]'), surface).not.toBeNull();
    }));
    expect(calls).toHaveLength(2);
  });

  it("only the owner probe allowed: the inbox shows and no staff entry does", async () => {
    stubNetwork({ [STAFF_PROBE]: { status: 200, body: { allowed: false } }, [OWNER_PROBE]: { status: 200, body: { allowed: true } } });
    renderShell();
    await waitFor(() => expect(answered).toHaveLength(2));
    await waitFor(() => expect(screen.queryByTestId("rail-account")).toBeInTheDocument());
    await new Promise(resolve => setTimeout(resolve, 30));
    await eachSurface(surface => {
      expect(document.querySelector('a[href="/feedback"]'), surface).not.toBeNull();
      expect(document.querySelector('a[href^="/admin/equipe"]'), surface).toBeNull();
    });
  });

  it("a probe that fails hides the entries and does not retry in a loop", async () => {
    stubNetwork({ [STAFF_PROBE]: { status: 500, body: {} }, [OWNER_PROBE]: { status: 500, body: {} } });
    renderShell();
    await waitFor(() => expect(answered).toHaveLength(2));
    await new Promise(resolve => setTimeout(resolve, 30));
    await eachSurface(surface => { expect(document.querySelector('a[href^="/admin/equipe"], a[href="/feedback"]'), surface).toBeNull(); });
    expect(calls).toHaveLength(2);
  });
});
