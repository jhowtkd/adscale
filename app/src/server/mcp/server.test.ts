import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { ADSCALE_MCP_SERVER_INFO, buildMcpServer, mcpHandler } from "./server";

describe("mcp server wiring", () => {
  it("registra tools + resources sem quebrar (conversão de schemas inclusa)", () => {
    const server = buildMcpServer({
      workspaceId: "ws-1",
      userId: "user-1",
      tokenPrefix: "adscale-mcp-abcd",
    });
    expect(server).toBeInstanceOf(McpServer);
    // A conversão zod→JSON Schema acontece no registro; falha aqui se o SDK rejeitar.
    expect(server.toolInputSchemaJson("criar_trabalho")).toMatchObject({ type: "object" });
    expect(server.toolInputSchemaJson("gerar_peca")).toMatchObject({ type: "object" });
    expect(server.toolInputSchemaJson("listar_pecas")).toMatchObject({ type: "object" });
    expect(server.toolInputSchemaJson("selecionar_peca")).toMatchObject({ type: "object" });
    expect(server.toolInputSchemaJson("cancelar_peca")).toMatchObject({ type: "object" });
  });

  it("expõe o handler HTTP dual-era", () => {
    expect(typeof mcpHandler.fetch).toBe("function");
    expect(ADSCALE_MCP_SERVER_INFO).toEqual({ name: "adscale", version: "1.0.0" });
  });

  it("tools/list no fio retorna as 5 tools (primeira fatia)", async () => {
    const res = await mcpHandler.fetch(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      {
        authInfo: {
          token: "smoke",
          clientId: "smoke",
          scopes: [],
          extra: { workspaceId: "ws", userId: "u", tokenPrefix: "p" },
        },
      }
    );
    expect(res.status).toBe(200);
    const dataLine = (await res.text())
      .split("\n")
      .find((line) => line.startsWith("data: "));
    const body = JSON.parse(dataLine!.slice("data: ".length)) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(body.result.tools.map((tool) => tool.name).sort()).toEqual(
      ["cancelar_peca", "criar_trabalho", "gerar_peca", "listar_pecas", "selecionar_peca"]
    );
  });
});
