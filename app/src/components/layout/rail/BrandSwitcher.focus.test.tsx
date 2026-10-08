import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

// The two dialogs of the brand menu are opened by state, after the menu is gone, so each says where focus goes back to
// (the brand control) and names its close button in the reader's language. This file renders them for real
// (BrandSwitcher.test.tsx stubs the create-brand dialog).
// jsdom puts focus back on the control even without `finalFocus` (the default restores the element focused at open), so
// the focus tests below guard the behaviour while the props test is the one that bites if `finalFocus`/`closeLabel` is dropped.

const dialogContent = vi.hoisted(() => ({ seen: [] as Array<{ closeLabel?: string; finalFocus?: { current: HTMLElement | null } }> }));
vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/dialog")>();
  return {
    ...actual,
    DialogContent: (props: React.ComponentProps<typeof actual.DialogContent>) => {
      dialogContent.seen.push(props as { closeLabel?: string; finalFocus?: { current: HTMLElement | null } });
      return <actual.DialogContent {...props} />;
    },
  };
});
vi.mock("@/lib/brands/active-brand-context", () => ({
  useActiveBrand: () => ({ id: "b-cafe", name: "Café Aurora" }),
  useSwitchActiveBrand: () => vi.fn(),
}));
let freePlan: { accountId: string | null } | null;
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => freePlan }));
vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => ({ data: [{ id: "b-cafe", name: "Café Aurora" }, { id: "b-livraria", name: "Livraria Norte" }] }),
  useCreateClientProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/billing/FreePlanCta", () => ({ FreePlanCta: () => <div data-testid="free-plan-cta" /> }));

import BrandSwitcher from "./BrandSwitcher";

const renderSwitcher = () => render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><BrandSwitcher /></NextIntlClientProvider>);

describe("BrandSwitcher dialogs", () => {
  beforeEach(() => {
    freePlan = null;
    dialogContent.seen.length = 0;
  });

  it("speaks of brands, not clients, in the add-brand dialog", async () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("rail-brand-switcher"));
    fireEvent.click(screen.getByTestId("rail-add-brand"));
    const dialog = await screen.findByRole("dialog", { name: "Nova marca" });
    expect(within(dialog).getByText("Cada marca tem sua conversa, sua Biblioteca e suas Criações.")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Nome da marca" })).toHaveAttribute("placeholder", "ex.: Café Aurora");
    expect(within(dialog).getByRole("button", { name: "Criar marca" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/cliente|Equipe/i);
  });

  it("hands both dialogs the brand control to return focus to and the Portuguese close label", () => {
    renderSwitcher();
    const trigger = screen.getByTestId("rail-brand-switcher");
    // The add-brand dialog and the plan card are both mounted (closed) next to the menu.
    expect(dialogContent.seen.length).toBeGreaterThanOrEqual(2);
    for (const props of dialogContent.seen) {
      expect(props.closeLabel).toBe("Fechar");
      expect(props.finalFocus?.current).toBe(trigger);
    }
  });

  it.each([
    ["Escape", (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: "Escape" })],
    ["Cancelar", (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }))],
    ["Fechar", (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }))],
  ])("gives focus back to the brand control when the add-brand dialog closes with %s", async (_how, close) => {
    renderSwitcher();
    const trigger = screen.getByTestId("rail-brand-switcher");
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("rail-add-brand"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    close(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it.each([
    ["Escape", (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: "Escape" })],
    ["Fechar", (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }))],
  ])("gives focus back to the brand control when the plan card closes with %s", async (_how, close) => {
    freePlan = { accountId: "acc-1" };
    renderSwitcher();
    const trigger = screen.getByTestId("rail-brand-switcher");
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Ver card do plano" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    close(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
