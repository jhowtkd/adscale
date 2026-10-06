// The free plan's CTA (ticket 11, part 2): the plan request of flow 0, "Falar com uma pessoa", never a checkout.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => (namespace ? `${namespace}.${key}` : key),
}));
const requestEquipeSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => requestEquipeSupport(...args) }));

import { FreePlanCta } from "./FreePlanCta";

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
});
