import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    (
      {
        title: "Agentes (MCP)",
        description: "Tokens para agentes.",
        secretTitle: "Token criado",
        secretWarning: "Copie agora.",
        copy: "Copiar",
        dismiss: "Fechar",
        namePlaceholder: "Nome do token",
        create: "Criar token",
        empty: "Nenhum token.",
        neverUsed: "Nunca usado",
        revoke: "Revogar",
        confirmRevoke: "Confirmar",
        revoked: "Token revogado.",
        revokedLabel: "Revogado",
      }[key] ?? key
    ),
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const addToastMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ useAppStore: () => addToastMock }));

import { McpTokensCard } from "./McpTokensCard";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("McpTokensCard", () => {
  it("esconde o card para quem não pode gerenciar (403)", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({}, 403));
    const { container } = render(<McpTokensCard />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("cria token e mostra o segredo uma vez", async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse({ tokens: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "t1", token: "adscale-mcp-segredo", prefix: "adscale-mcp-segr" }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ tokens: [{ id: "t1", name: "Claude", prefix: "adscale-mcp-segr", createdAt: "", lastUsedAt: null, revokedAt: null }] })
      );
    render(<McpTokensCard />);
    await waitFor(() => expect(screen.getByText("Nenhum token.")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("mcp-token-name"), { target: { value: "Claude" } });
    fireEvent.click(screen.getByTestId("mcp-token-create"));
    await waitFor(() =>
      expect(screen.getByTestId("mcp-token-secret")).toHaveTextContent("adscale-mcp-segredo")
    );
  });

  it("revogar exige dois cliques", async () => {
    apiFetchMock
      .mockResolvedValueOnce(
        jsonResponse({ tokens: [{ id: "t1", name: "Claude", prefix: "adscale-mcp-segr", createdAt: "", lastUsedAt: null, revokedAt: null }] })
      )
      .mockResolvedValueOnce(jsonResponse({ revoked: true }));
    render(<McpTokensCard />);
    const button = await screen.findByTestId("mcp-token-revoke-t1");
    fireEvent.click(button);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Confirmar")).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(apiFetchMock.mock.calls[1][0]).toBe("/api/workspace/mcp-tokens/t1");
    expect(screen.getByText("Revogado")).toBeInTheDocument();
  });
});
