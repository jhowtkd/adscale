import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PieceReview from "./PieceReview";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { version?: number }) => {
    if (key === "reviewVersion") return `Versão ${values?.version}`;
    return {
      reviewTitle: "Revisar esta peça",
      reviewName: "Seu nome",
      reviewComment: "Comentário",
      reviewPinHint: "Clique na peça",
      reviewApprove: "Aprovar",
      reviewRequestChanges: "Pedir ajuste",
      reviewSend: "Comentar",
      reviewHistory: "Histórico",
      reviewEmpty: "Ainda não há comentários.",
      reviewObjectiveBlocked: "Reprovação objetiva",
      reviewDecisionComment: "Comentário",
      reviewDecisionApprove: "Aprovou",
      reviewDecisionChanges: "Pediu ajuste",
      unavailableBody: "falhou",
    }[key] ?? key;
  },
}));

describe("PieceReview", () => {
  it("posts a comment pinned to the frozen version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [{
          id: "c-1",
          outputVersion: 2,
          authorLabel: "Ana",
          decision: "request_changes",
          body: "Logo alto",
          area: { x: 0.1, y: 0.1, width: 0.12, height: 0.12 },
          createdAt: "2026-09-08T00:00:00.000Z",
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PieceReview
        token="tok"
        outputId="out-1"
        outputVersion={2}
        imageUrl="/api/share/tok/asset/out-1"
        title="Peça"
        canApprove
        history={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Seu nome"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Comentário"), { target: { value: "Logo alto" } });
    fireEvent.click(screen.getByRole("button", { name: "Pedir ajuste" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/share/tok/asset/out-1", expect.objectContaining({
        method: "POST",
      }));
    });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      decision: string;
      authorLabel: string;
    };
    expect(body.decision).toBe("request_changes");
    expect(body.authorLabel).toBe("Ana");
    expect(screen.getByText("Logo alto")).toBeVisible();
    expect(screen.getByText(/Pediu ajuste/)).toBeVisible();
  });

  it("hides approve when objective rejection already blocked the piece", () => {
    render(
      <PieceReview
        token="tok"
        outputId="out-1"
        outputVersion={1}
        imageUrl="/api/share/tok/asset/out-1"
        title="Peça"
        canApprove={false}
        history={[]}
      />,
    );
    expect(screen.getByText("Reprovação objetiva")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  });
});
