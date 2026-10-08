import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useCreateClientProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

import AssistantCreateClientDialog from "./AssistantCreateClientDialog";

describe("AssistantCreateClientDialog", () => {
  it("keeps its English close button for the callers that pass no label", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <AssistantCreateClientDialog open onOpenChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("names its close button with the label it is given", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <AssistantCreateClientDialog open onOpenChange={vi.fn()} closeLabel="Fechar" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  describe("returns focus to the control it is given", () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
          <button ref={ref} type="button" onClick={() => setOpen(true)}>Abrir</button>
          <AssistantCreateClientDialog open={open} onOpenChange={setOpen} finalFocus={ref} />
        </NextIntlClientProvider>
      );
    }

    it.each([
      ["Escape", () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })],
      ["Cancelar", () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))],
    ])("after closing with %s", async (_how, close) => {
      render(<Opener />);
      const opener = screen.getByRole("button", { name: "Abrir" });
      opener.focus();
      fireEvent.click(opener);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      close();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(opener).toHaveFocus());
    });
  });
});
