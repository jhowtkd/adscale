import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TalkBox } from "./TalkBox";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

const required = {
  placement: "dock" as const,
  request: "Campanha de setembro",
  onRequestChange: vi.fn(),
  intent: "single" as const,
  onSelectIntent: vi.fn(),
  sources: [] as [],
  onAddFiles: vi.fn(),
  error: null,
  generateLabel: "Gerar",
};

it("separa o botão de expansão do resumo recolhido", () => {
  render(
    <TalkBox
      {...required}
      onGenerate={vi.fn()}
      expanded={false}
      onExpandedChange={vi.fn()}
      summary={<span>Create Post E2E Brand · 4:5</span>}
    />,
  );
  const expand = screen.getByRole("button", { name: "studioDesk.expand" });
  const header = expand.parentElement!;
  expect(header.className).toMatch(/gap-3/);
  expect(header).toHaveTextContent("Create Post E2E Brand · 4:5");
  expect(header.querySelector(".truncate")).toHaveTextContent("Create Post E2E Brand · 4:5");
});

it("mantém o foco no botão ao expandir", () => {
  function Harness() {
    const [expanded, setExpanded] = useState(false);
    return (
      <TalkBox
        {...required}
        onGenerate={vi.fn()}
        expanded={expanded}
        onExpandedChange={setExpanded}
      />
    );
  }
  render(<Harness />);
  const expand = screen.getByRole("button", { name: "studioDesk.expand" });
  expand.focus();
  fireEvent.click(expand);
  expect(screen.getByTestId("studio-talk-box")).toHaveAttribute("data-expanded", "true");
  expect(screen.getByRole("button", { name: "studioDesk.collapse" })).toHaveFocus();
});

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

it("não mostra o botão de expansão sem onExpandedChange", () => {
  render(<TalkBox {...required} onGenerate={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "studioDesk.expand" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "studioDesk.collapse" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Gerar" })).toBeInTheDocument();
});

it("recolhe com Escape e restaura o foco no botão", () => {
  function Harness() {
    const [expanded, setExpanded] = useState(false);
    return (
      <TalkBox
        {...required}
        request="Campanha de setembro"
        onRequestChange={vi.fn()}
        onGenerate={vi.fn()}
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
  expect(screen.getByTestId("studio-talk-box")).toHaveAttribute("data-expanded", "true");
  fireEvent.keyDown(request, { key: "Escape" });
  expect(screen.getByTestId("studio-talk-box")).toHaveAttribute("data-expanded", "false");
  expect(screen.getByRole("button", { name: "studioDesk.expand" })).toHaveFocus();
});
