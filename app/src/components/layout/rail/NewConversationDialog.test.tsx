import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const openMock = vi.fn();
vi.mock("@/lib/equipe/parallel-thread", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/equipe/parallel-thread")>()),
  openParallelConversation: (...args: unknown[]) => openMock(...args),
}));

import NewConversationDialog from "./NewConversationDialog";

function setup(props: { accountId?: string | null; clientProfileId?: string | null } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const onOpenChange = vi.fn();
  const ui = render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <QueryClientProvider client={client}>
        <NewConversationDialog
          open
          onOpenChange={onOpenChange}
          accountId={props.accountId === undefined ? "acc-1" : props.accountId}
          clientProfileId={props.clientProfileId === undefined ? "profile-1" : props.clientProfileId}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { ...ui, invalidate, onOpenChange };
}

const topicField = () => screen.getByLabelText("Assunto da conversa");
const create = () => screen.getByRole("button", { name: "Criar conversa" });

describe("NewConversationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue("thread-9");
  });

  it("asks for the topic, with a name and a limit of 200 characters", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Nova conversa" })).toBeInTheDocument();
    expect(topicField()).toHaveAttribute("maxlength", "200");
  });

  it("requires a topic: a blank one shows the message and calls nothing", () => {
    setup();
    fireEvent.change(topicField(), { target: { value: "   " } });
    fireEvent.click(create());
    expect(screen.getByRole("alert")).toHaveTextContent("Escreva o assunto da conversa.");
    expect(openMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("creates the conversation, refreshes the account state and opens it", async () => {
    const { invalidate, onOpenChange } = setup();
    fireEvent.change(topicField(), { target: { value: "Promoção de abril" } });
    fireEvent.click(create());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/assistant?threadId=thread-9"));
    expect(openMock).toHaveBeenCalledExactlyOnceWith({ accountId: "acc-1", clientProfileId: "profile-1", topic: "Promoção de abril" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["equipe", "acc-1", "account"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the error and does not navigate when creating fails, keeping the topic", async () => {
    openMock.mockRejectedValue(new Error("thread_create_failed"));
    const { onOpenChange } = setup();
    fireEvent.change(topicField(), { target: { value: "Promoção de abril" } });
    fireEvent.click(create());
    expect(await screen.findByRole("alert")).toHaveTextContent("Não consegui criar a conversa. Tente de novo.");
    expect(push).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(topicField()).toHaveValue("Promoção de abril");
    expect(create()).toBeEnabled();
  });

  it("does not close while sending, and sends once even if submitted twice", async () => {
    let resolve!: (id: string) => void;
    openMock.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const { onOpenChange } = setup();
    fireEvent.change(topicField(), { target: { value: "Assunto" } });
    fireEvent.click(create());
    const busy = await screen.findByRole("button", { name: "Criando…" });
    expect(busy).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.submit(topicField().closest("form")!);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledTimes(1);
    resolve("thread-1");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/assistant?threadId=thread-1"));
  });

  it("cannot be submitted without an account or a brand yet", () => {
    setup({ accountId: null });
    expect(create()).toBeDisabled();
    fireEvent.change(topicField(), { target: { value: "Assunto" } });
    fireEvent.submit(topicField().closest("form")!);
    expect(openMock).not.toHaveBeenCalled();
  });

  it("closes from Cancelar", () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
