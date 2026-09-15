import "server-only";
import {
  McpServer,
  ResourceTemplate,
  createMcpHandler,
} from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import {
  cancelarPeca,
  criarTrabalho,
  gerarPeca,
  lerPeca,
  lerTrabalho,
  listarPecas,
  selecionarPeca,
  type McpToolContext,
  type McpToolResult,
} from "./tools";

/**
 * ADScale como MCP server — primeira fatia (#355 rev. 2): loop Estúdio
 * (criar → gerar → listar/selecionar) + resources peca/trabalho.
 * Stateless dual-era: `createMcpHandler` default já serve 2025 (legacy
 * stateless) + 2026-07-28 (modern). Sem sessão in-memory.
 * Auth: Bearer verificado na rota; o factory recebe o contexto via authInfo.
 */

export const ADSCALE_MCP_SERVER_INFO = { name: "adscale", version: "1.0.0" } as const;

export type McpRequestAuth = McpToolContext;

const trabalhoIdSchema = z.object({ trabalho_id: z.string().uuid() });

const criarTrabalhoSchema = z.object({
  marca: z.string().min(1).describe("Nome ou id da marca (client profile) do workspace"),
  pedido: z.string().min(1).describe("Pedido criativo do operador, em texto livre"),
  protocolo: z.enum(["single", "variations", "format_adaptation", "restyle"]).optional().describe("Protocolo do Trabalho (default single)"),
  formato: z.enum(["1:1", "4:5", "9:16"]).optional().describe("Formato da Peça (default 4:5)"),
  formatos_destino: z.array(z.enum(["1:1", "4:5", "9:16"])).optional().describe("Obrigatório para format_adaptation"),
});

const selecionarPecaSchema = z.object({
  trabalho_id: z.string().uuid(),
  peca_id: z.string().uuid(),
});

function toToolResult(result: McpToolResult) {
  if (result.ok) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data) }],
      structuredContent: result.data,
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          erro: result.code,
          mensagem: result.message,
          detalhes: result.details ?? null,
        }),
      },
    ],
    isError: true as const,
  };
}

function toResourceContents(uri: URL, result: McpToolResult) {
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(result.data),
      },
    ],
  };
}

export function buildMcpServer(auth: McpRequestAuth): McpServer {
  const ctx: McpToolContext = {
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    tokenPrefix: auth.tokenPrefix,
  };
  const server = new McpServer({ ...ADSCALE_MCP_SERVER_INFO });

  server.registerTool(
    "criar_trabalho",
    {
      description: "Cria um Trabalho (rascunho criativo) numa marca do workspace.",
      inputSchema: criarTrabalhoSchema,
    },
    async (args) => toToolResult(await criarTrabalho(ctx, args))
  );

  server.registerTool(
    "gerar_peca",
    {
      description:
        "Gera Peça(s) de um Trabalho. Retorna os job ids (peca_id) imediatamente — NÃO bloqueia. Use listar_pecas ou o resource peca até status completed/failed.",
      inputSchema: trabalhoIdSchema,
    },
    async (args) => toToolResult(await gerarPeca(ctx, args))
  );

  server.registerTool(
    "listar_pecas",
    {
      description: "Lista as Peças de um Trabalho com status, veredito e seleção.",
      inputSchema: trabalhoIdSchema,
    },
    async (args) => toToolResult(await listarPecas(ctx, args))
  );

  server.registerTool(
    "selecionar_peca",
    {
      description:
        "Seleção por agente (não é Aprovação humana): marca a Peça como escolhida. Respeita reprovação objetiva; veredito inconclusivo só o operador confirma.",
      inputSchema: selecionarPecaSchema,
    },
    async (args) => toToolResult(await selecionarPeca(ctx, args))
  );

  server.registerTool(
    "cancelar_peca",
    {
      description: "Cancela uma Peça pendente (queued/processing). Peças terminadas não cancelam.",
      inputSchema: selecionarPecaSchema,
    },
    async (args) => toToolResult(await cancelarPeca(ctx, args))
  );

  server.registerResource(
    "trabalho",
    new ResourceTemplate("adscale://trabalho/{trabalho_id}", { list: undefined }),
    { description: "Trabalho com pedido, status e Peças.", mimeType: "application/json" },
    async (uri, variables) =>
      toResourceContents(uri, await lerTrabalho(ctx, String(variables.trabalho_id)))
  );

  server.registerResource(
    "peca",
    new ResourceTemplate("adscale://peca/{trabalho_id}/{peca_id}", { list: undefined }),
    { description: "Peça com status de geração, veredito e seleção.", mimeType: "application/json" },
    async (uri, variables) =>
      toResourceContents(
        uri,
        await lerPeca(ctx, String(variables.trabalho_id), String(variables.peca_id))
      )
  );

  return server;
}

export const mcpHandler = createMcpHandler((mcpCtx) => {
  const extra = (mcpCtx.authInfo?.extra ?? {}) as Partial<McpRequestAuth>;
  return buildMcpServer({
    workspaceId: String(extra.workspaceId ?? ""),
    userId: String(extra.userId ?? ""),
    tokenPrefix: String(extra.tokenPrefix ?? ""),
  });
});
