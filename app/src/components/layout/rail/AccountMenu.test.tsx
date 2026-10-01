import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
let session: { user: { name?: string; email?: string } } | null = null;
const signOut = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: session }), signOut: (...args: unknown[]) => signOut(...args) },
}));
vi.mock("@/lib/store", () => ({
  useAppStore: (selector: (s: { user: { firstName: string; lastName: string; email: string } }) => unknown) =>
    selector({ user: { firstName: "Maria", lastName: "Souza", email: "maria@example.com" } }),
}));
let staffAllowed: boolean | undefined;
let ownerAllowed: boolean | undefined;
vi.mock("@/lib/hooks/use-equipe-staff", () => ({ useEquipeStaffAccess: () => ({ data: staffAllowed === undefined ? undefined : { allowed: staffAllowed } }) }));
vi.mock("@/lib/hooks/use-platform-owner", () => ({ usePlatformOwnerAccess: () => ({ data: ownerAllowed === undefined ? undefined : { allowed: ownerAllowed } }) }));

import AccountMenu, { initialsOf } from "./AccountMenu";

const open = () => {
  render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><AccountMenu /></NextIntlClientProvider>);
  fireEvent.click(screen.getByTestId("rail-account"));
};

describe("initialsOf", () => {
  it.each([
    ["Maria Souza", "MS"],
    ["maria souza lima", "MS"],
    ["  ana   paula ", "AP"],
    ["Madonna", "M"],
    ["", "U"],
    ["   ", "U"],
  ])("turns %j into %j", (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session = { user: { name: "Maria Souza", email: "maria@example.com" } };
    staffAllowed = undefined;
    ownerAllowed = undefined;
  });

  it("has an accessible trigger named after the person, showing their initials", () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><AccountMenu /></NextIntlClientProvider>);
    const trigger = screen.getByRole("button", { name: "Menu da conta de Maria Souza" });
    expect(trigger).toHaveTextContent("MS");
  });

  it("falls back to the store user when there is no session", () => {
    session = null;
    render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><AccountMenu /></NextIntlClientProvider>);
    expect(screen.getByRole("button", { name: "Menu da conta de Maria Souza" })).toBeInTheDocument();
  });

  it("holds settings, docs and sign out, and shows who is signed in", () => {
    open();
    expect(screen.getByRole("menuitem", { name: ptBR.navigation.config })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("menuitem", { name: ptBR.navigation.docs })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("menuitem", { name: ptBR.navigation.logout })).toBeInTheDocument();
    expect(screen.getByTestId("rail-account-identity")).toHaveTextContent("maria@example.com");
  });

  it("hides the feedback and staff consoles from regular people", () => {
    open();
    expect(screen.queryByRole("menuitem", { name: ptBR.navigation.feedback })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: ptBR.navigation.equipeAccounts })).not.toBeInTheDocument();
  });

  it("shows the feedback console to the platform owner and the consoles to staff", () => {
    staffAllowed = true;
    ownerAllowed = true;
    open();
    expect(screen.getByRole("menuitem", { name: ptBR.navigation.feedback })).toHaveAttribute("href", "/feedback");
    expect(screen.getByRole("menuitem", { name: ptBR.navigation.equipeExceptions })).toHaveAttribute("href", "/admin/equipe/exceptions");
    expect(screen.getByRole("menuitem", { name: ptBR.navigation.equipeAccounts })).toHaveAttribute("href", "/admin/equipe/accounts");
    expect(screen.getByRole("menuitem", { name: ptBR.navigation.equipeQuality })).toHaveAttribute("href", "/admin/equipe/quality");
  });

  it("signs out and goes to the login page", () => {
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: ptBR.navigation.logout }));
    expect(signOut).toHaveBeenCalledTimes(1);
    const { fetchOptions } = signOut.mock.calls[0][0] as { fetchOptions: { onSuccess: () => void } };
    fetchOptions.onSuccess();
    expect(push).toHaveBeenCalledWith("/login");
  });
});
