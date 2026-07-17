import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreativeResultCard } from "./CreativeResultCard";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";

function output(overrides: Partial<CreativeWorkOutput> = {}): CreativeWorkOutput {
  return {
    id: "output-1",
    workspaceId: "ws-1",
    workItemId: "work-1",
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 1,
    parentOutputId: null,
    revisionInstruction: null,
    revisionAssetId: null,
    operationKey: "balanced:4:5:1",
    retryCount: 0,
    status: "completed",
    outputKey: "creative-work/output-1/image.png",
    cost: 5,
    failureCode: null,
    quality: null,
    isSelected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("CreativeResultCard", () => {
  it("shows completed imagery and approve, download, and inline edit actions", () => {
    const onRevise = vi.fn();
    render(
      <CreativeResultCard
        output={output()}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={onRevise}
      />,
    );

    expect(screen.getByRole("img", { name: /equilibrada/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Baixar" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByRole("textbox", { name: "O que você quer mudar?" }), {
      target: { value: "Use mais contraste" },
    });
    const file = new File(["image"], "referencia.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Anexo opcional"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar nova versão · 5 créditos" }));

    expect(onRevise).toHaveBeenCalledWith("output-1", "Use mais contraste", file);
  });

  it("renders an independent status for processing and retries only the failed card", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <CreativeResultCard
        output={output({ status: "processing", outputKey: null })}
        label="Equilibrada"
        onRetry={onRetry}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Gerando...");
    expect(screen.queryByRole("button", { name: /Repetir/ })).not.toBeInTheDocument();

    rerender(
      <CreativeResultCard
        output={output({ status: "failed", outputKey: null })}
        label="Equilibrada"
        onRetry={onRetry}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Repetir esta proposta" }));
    expect(onRetry).toHaveBeenCalledWith("output-1");
  });
});
