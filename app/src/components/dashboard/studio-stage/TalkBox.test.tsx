import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TalkBox } from "./TalkBox";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

it("recolhe sem perder o pedido e o controle contextual", () => {
  const generate = vi.fn();
  function Harness() {
    const [expanded, setExpanded] = useState(false);
    const [request, setRequest] = useState("Campanha de setembro");
    return (
      <TalkBox
        placement="dock"
        request={request}
        onRequestChange={setRequest}
        intent="single"
        onSelectIntent={vi.fn()}
        sources={[]}
        onAddFiles={vi.fn()}
        error={null}
        onGenerate={generate}
        generateLabel="Gerar"
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <input aria-label="Detalhe local" defaultValue="preservado" />
      </TalkBox>
    );
  }
  render(<Harness />);
  const request = document.querySelector("#creative-composer-request")!;
  fireEvent.focus(request);
  const detail = screen.getByLabelText("Detalhe local");
  fireEvent.change(detail, { target: { value: "edição local" } });
  fireEvent.click(screen.getByRole("button", { name: "studioDesk.collapse" }));
  expect(screen.getByTestId("studio-talk-box")).toHaveAttribute("data-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "studioDesk.expand" }));
  expect(screen.getByLabelText("Detalhe local")).toBe(detail);
  expect(detail).toHaveValue("edição local");
  expect(request).toHaveValue("Campanha de setembro");
  expect(generate).not.toHaveBeenCalled();
});
