// The free plan's CTA (ticket 11, part 2): the plan request of flow 0, "Falar com uma pessoa", never a checkout.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => (namespace ? `${namespace}.${key}` : key),
}));
const requestEquipeSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => requestEquipeSupport(...args) }));

// What the account state says (planAvailable): the plan can be asked only after a recorded diagnosis (or a blocked one).
const mockState = vi.hoisted(() => ({ value: { data: { planAvailable: true } } as { data?: { planAvailable?: boolean } } }));
const useEquipeAccountState = vi.hoisted(() => vi.fn());
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: (...args: unknown[]) => useEquipeAccountState(...args) }));

import { FreePlanCta } from "./FreePlanCta";
import { PLAN_PERSON_NOTE, usePlanRequest } from "@/lib/equipe/use-plan-request";

function renderCta(props: Partial<Parameters<typeof FreePlanCta>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FreePlanCta accountId="acc-free" {...props} />
    </QueryClientProvider>
  );
}

describe("FreePlanCta", () => {
  beforeEach(() => {
    requestEquipeSupport.mockReset();
    useEquipeAccountState.mockReset();
    mockState.value = { data: { planAvailable: true } };
    useEquipeAccountState.mockImplementation(() => mockState.value);
  });

  it("offers the plan request, with the intro when the surface has none of its own", () => {
    renderCta({ intro: "O assistente da campanha faz parte do plano." });

    expect(screen.getByTestId("free-plan-cta")).toBeInTheDocument();
    expect(screen.getByText("O assistente da campanha faz parte do plano.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "billing.conversion.freePlan.action" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("assistant.equipe.plan.contact");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(requestEquipeSupport).not.toHaveBeenCalled();
  });

  it("renders no intro paragraph when there is none", () => {
    renderCta();

    expect(screen.getByTestId("free-plan-cta").querySelectorAll("p")).toHaveLength(1); // only the status line
  });

  it("clicking asks for the PLAN of that account, once", async () => {
    requestEquipeSupport.mockResolvedValue({});
    renderCta();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledTimes(1));
    expect(requestEquipeSupport).toHaveBeenCalledWith("acc-free", { purpose: "plan" });
  });

  it("while sending: the button is disabled and says so, and a second click sends nothing", async () => {
    let finish: (value: unknown) => void = () => {};
    requestEquipeSupport.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderCta();

    fireEvent.click(screen.getByRole("button"));

    const sending = await screen.findByRole("button", { name: "assistant.equipe.plan.sending" });
    expect(sending).toBeDisabled();
    fireEvent.click(sending);
    expect(requestEquipeSupport).toHaveBeenCalledTimes(1);

    await act(async () => { finish({}); });
  });

  it("after sending: confirmation, the button says requested and stays disabled, and the confirmation takes the focus", async () => {
    requestEquipeSupport.mockResolvedValue({});
    renderCta();

    fireEvent.click(screen.getByRole("button"));

    const requested = await screen.findByRole("button", { name: "assistant.equipe.plan.requested" });
    expect(requested).toBeDisabled();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("assistant.equipe.plan.confirmation");
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("on failure: an alert, the button is back (not 'requested') and takes the focus, and a new click tries again", async () => {
    requestEquipeSupport.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});
    renderCta();

    fireEvent.click(screen.getByRole("button"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("assistant.equipe.plan.error");
    const button = screen.getByRole("button", { name: "billing.conversion.freePlan.action" });
    expect(button).toBeEnabled();
    await waitFor(() => expect(button).toHaveFocus());

    fireEvent.click(button);

    await screen.findByRole("button", { name: "assistant.equipe.plan.requested" });
    expect(requestEquipeSupport).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("two CTAs of the same account share the request: once one asked, the other shows it too", async () => {
    requestEquipeSupport.mockResolvedValue({});
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FreePlanCta accountId="acc-free" />
        <FreePlanCta accountId="acc-free" />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getAllByRole("button")[0]);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "assistant.equipe.plan.requested" })).toHaveLength(2));
    expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
  });

  // PR 626 review, F7: the button always does what it says, in every state of the free plan.
  describe("the four states of the free plan (F7)", () => {
    it.each([
      ["before the handoff/diagnosis (no state yet)", { data: undefined }],
      ["before the diagnosis (planAvailable absent)", { data: {} }],
      ["during the diagnosis (planAvailable false)", { data: { planAvailable: false } }],
    ])("%s: asks for a PERSON with the plan note, never the plan request", async (_name, state) => {
      mockState.value = state;
      requestEquipeSupport.mockResolvedValue({});
      renderCta();

      fireEvent.click(screen.getByRole("button", { name: "billing.conversion.freePlan.action" }));

      await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledTimes(1));
      expect(requestEquipeSupport).toHaveBeenCalledWith("acc-free", { note: PLAN_PERSON_NOTE });
      expect(requestEquipeSupport.mock.calls[0][1]).not.toHaveProperty("purpose");
      expect(useEquipeAccountState).toHaveBeenCalledWith("acc-free");
    });

    it("after the diagnosis (planAvailable true, also D-12 'credit ran out'): asks for the PLAN", async () => {
      requestEquipeSupport.mockResolvedValue({});
      renderCta();

      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledTimes(1));
      expect(requestEquipeSupport).toHaveBeenCalledWith("acc-free", { purpose: "plan" });
      expect(requestEquipeSupport.mock.calls[0][1]).not.toHaveProperty("note");
    });

    it("the state arriving mid-way changes what the next click asks", async () => {
      mockState.value = { data: { planAvailable: false } };
      requestEquipeSupport.mockResolvedValue({});
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const ui = () => (<QueryClientProvider client={client}><FreePlanCta accountId="acc-free" /></QueryClientProvider>);
      const { rerender } = render(ui());
      mockState.value = { data: { planAvailable: true } };
      rerender(ui());

      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledWith("acc-free", { purpose: "plan" }));
    });
  });

  describe("without an Equipe account yet (accountId null)", () => {
    it("is a link to the conversation with the note, and sends no command (even on click)", () => {
      renderCta({ accountId: null, intro: "Por que isto aparece." });

      const link = screen.getByRole("link", { name: "billing.conversion.freePlan.openConversation" });
      expect(link).toHaveAttribute("href", "/");
      expect(screen.getByText("billing.conversion.freePlan.noAccount")).toBeInTheDocument();
      expect(screen.getByText("Por que isto aparece.")).toBeInTheDocument();
      expect(screen.getByTestId("free-plan-cta")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      fireEvent.click(link);
      expect(requestEquipeSupport).not.toHaveBeenCalled();
      expect(useEquipeAccountState).not.toHaveBeenCalledWith("acc-free");
    });

    it("renders no intro paragraph when there is none", () => {
      renderCta({ accountId: null });

      expect(screen.getByTestId("free-plan-cta").querySelectorAll("p")).toHaveLength(1); // only the note
    });
  });

  describe("as a person: sending, sent, error", () => {
    beforeEach(() => { mockState.value = { data: { planAvailable: false } }; });

    it("sending: disabled, says so, a second click sends nothing", async () => {
      let finish: (value: unknown) => void = () => {};
      requestEquipeSupport.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      renderCta();

      fireEvent.click(screen.getByRole("button"));

      const sending = await screen.findByRole("button", { name: "assistant.equipe.plan.sending" });
      expect(sending).toBeDisabled();
      fireEvent.click(sending);
      expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
      await act(async () => { finish({}); });
    });

    it("sent: confirmation takes the focus, the button stays 'requested' and disabled", async () => {
      requestEquipeSupport.mockResolvedValue({});
      renderCta();

      fireEvent.click(screen.getByRole("button"));

      const requested = await screen.findByRole("button", { name: "assistant.equipe.plan.requested" });
      expect(requested).toBeDisabled();
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("assistant.equipe.plan.confirmation");
      await waitFor(() => expect(status).toHaveFocus());
      fireEvent.click(requested);
      expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
    });

    it("error: alert, button back and focused, a new click asks a person again", async () => {
      requestEquipeSupport.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});
      renderCta();

      fireEvent.click(screen.getByRole("button"));

      expect(await screen.findByRole("alert")).toHaveTextContent("assistant.equipe.plan.error");
      const button = screen.getByRole("button", { name: "billing.conversion.freePlan.action" });
      await waitFor(() => expect(button).toHaveFocus());
      fireEvent.click(button);

      await screen.findByRole("button", { name: "assistant.equipe.plan.requested" });
      expect(requestEquipeSupport).toHaveBeenCalledTimes(2);
      expect(requestEquipeSupport).toHaveBeenNthCalledWith(2, "acc-free", { note: PLAN_PERSON_NOTE });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("two person-mode CTAs of the same account share the request", async () => {
      requestEquipeSupport.mockResolvedValue({});
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <FreePlanCta accountId="acc-free" />
          <FreePlanCta accountId="acc-free" />
        </QueryClientProvider>
      );

      fireEvent.click(screen.getAllByRole("button")[0]);

      await waitFor(() => expect(screen.getAllByRole("button", { name: "assistant.equipe.plan.requested" })).toHaveLength(2));
      expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
    });
  });

  describe("the person request and the plan request are tracked apart", () => {
    function Probe() {
      const plan = usePlanRequest("acc-free");
      return <p data-testid="plan-card">{plan.requested ? "plan-requested" : "plan-open"}</p>;
    }

    it("a person request does not mark the plan card as requested, and the plan card still sends the plan", async () => {
      mockState.value = { data: { planAvailable: false } };
      requestEquipeSupport.mockResolvedValue({});
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(<QueryClientProvider client={client}><FreePlanCta accountId="acc-free" /><Probe /></QueryClientProvider>);

      fireEvent.click(screen.getByRole("button"));
      await screen.findByRole("button", { name: "assistant.equipe.plan.requested" });

      expect(screen.getByTestId("plan-card")).toHaveTextContent("plan-open");
    });

    it("a plan request (plan card) does not mark the person-mode CTA as requested", async () => {
      mockState.value = { data: { planAvailable: false } };
      requestEquipeSupport.mockResolvedValue({});
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function Asker() {
        const plan = usePlanRequest("acc-free");
        return <button type="button" onClick={() => void plan.request()}>ask-plan</button>;
      }
      render(<QueryClientProvider client={client}><FreePlanCta accountId="acc-free" /><Asker /></QueryClientProvider>);

      fireEvent.click(screen.getByRole("button", { name: "ask-plan" }));
      await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledWith("acc-free", { purpose: "plan" }));

      expect(screen.getByRole("button", { name: "billing.conversion.freePlan.action" })).toBeEnabled();
    });
  });
});
