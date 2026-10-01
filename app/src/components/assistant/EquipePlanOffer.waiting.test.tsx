// Ticket 08: a plan card waits while a correction of the diagnosis is pending (planAvailable === false).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EquipePlanOffer from "./EquipePlanOffer";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";

const mockRequestSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => mockRequestSupport(...args) }));

const mockAccountState = vi.fn();
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: (...args: unknown[]) => mockAccountState(...args) }));

const copy = ptBR.assistant.equipe.plan;
const state = (data: unknown, extra: Record<string, unknown> = {}) => mockAccountState.mockReturnValue({ data, isLoading: false, error: null, ...extra });

function mount(ui: React.ReactElement, messages = ptBR, locale = "pt-BR") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: React.ReactElement) => (
    <NextIntlClientProvider locale={locale} messages={messages}><QueryClientProvider client={client}>{node}</QueryClientProvider></NextIntlClientProvider>
  );
  const view = render(wrap(ui));
  return { ...view, again: (node: React.ReactElement) => view.rerender(wrap(node)) };
}
const card = () => <EquipePlanOffer accountId="account-1" threadId="thread-1" onSuggestion={vi.fn()} />;
const subscribe = () => screen.getByRole("button", { name: copy.subscribe });

describe("EquipePlanOffer while the diagnosis is being replaced", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("planAvailable:false disables the subscribe button and shows the waiting line instead of the contact line", () => {
    state({ planAvailable: false });
    mount(card());
    expect(subscribe()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(copy.waiting);
    expect(screen.getByRole("status")).not.toHaveTextContent(copy.contact);
    expect(mockAccountState).toHaveBeenCalledWith("account-1");
  });

  it("a click on the disabled button never calls requestEquipeSupport", () => {
    state({ planAvailable: false });
    mount(card());
    fireEvent.click(subscribe());
    expect(mockRequestSupport).not.toHaveBeenCalled();
  });

  it.each([
    ["true", { planAvailable: true }],
    ["absent (an older server)", {}],
    ["no state yet (loading)", undefined],
  ])("planAvailable %s: enabled with the usual contact line", (_name, data) => {
    state(data, data === undefined ? { isLoading: true } : {});
    mount(card());
    expect(subscribe()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(copy.contact);
    expect(screen.getByRole("status")).not.toHaveTextContent(copy.waiting);
  });

  it("an error fetching the state keeps the card enabled as today", () => {
    mockAccountState.mockReturnValue({ data: undefined, isLoading: false, error: new Error("network") });
    mount(card());
    expect(subscribe()).toBeEnabled();
  });

  it("'Agora não' is not affected by the wait", () => {
    state({ planAvailable: false });
    const onSuggestion = vi.fn();
    mount(<EquipePlanOffer accountId="account-1" threadId="thread-1" onSuggestion={onSuggestion} />);
    const later = screen.getByRole("button", { name: copy.later });
    expect(later).toBeEnabled();
    fireEvent.click(later);
    expect(onSuggestion).toHaveBeenCalledWith(copy.continueMessage);
  });

  it("when the account state turns available the button enables and the request goes through", () => {
    mockRequestSupport.mockResolvedValue({});
    state({ planAvailable: false });
    const view = mount(card());
    expect(subscribe()).toBeDisabled();
    state({ planAvailable: true });
    view.again(card());
    expect(subscribe()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(copy.contact);
    fireEvent.click(subscribe());
    expect(mockRequestSupport).toHaveBeenCalledWith("account-1", { purpose: "plan" });
  });

  it("back to waiting after a new correction (true → false) disables it again", () => {
    state({ planAvailable: true });
    const view = mount(card());
    expect(subscribe()).toBeEnabled();
    state({ planAvailable: false });
    view.again(card());
    expect(subscribe()).toBeDisabled();
  });

  it("the waiting line exists in both languages and carries no price", () => {
    state({ planAvailable: false });
    mount(card(), en, "en");
    expect(screen.getByRole("status")).toHaveTextContent(en.assistant.equipe.plan.waiting);
    expect(ptBR.assistant.equipe.plan.waiting).toBe("O plano volta a ficar disponível quando o novo diagnóstico ficar pronto.");
    expect(en.assistant.equipe.plan.waiting).toBe("The plan is available again once the new diagnosis is ready.");
    expect(ptBR.assistant.equipe.plan.waiting + en.assistant.equipe.plan.waiting).not.toMatch(/r\$|\$\s?\d|pre[çc]o|price/i);
  });
});
