import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (
    {
      start: "Ditar pedido",
      stop: "Parar e transcrever",
      unsupported: "Este navegador não suporta ditado.",
    }[key] ?? key
  ),
}));

import { DictationButton } from "./DictationButton";

describe("DictationButton", () => {
  it("mostra mensagem própria quando o navegador não suporta ditado", () => {
    // jsdom não tem MediaRecorder/getUserMedia: cai no ramo unsupported.
    render(<DictationButton onInsert={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dictation-button"));
    expect(screen.getByTestId("dictation-error")).toHaveTextContent(
      "Este navegador não suporta ditado."
    );
  });

  it("parte do estado ocioso com rótulo de início", () => {
    render(<DictationButton onInsert={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Ditar pedido" })).toBeInTheDocument();
  });
});
