import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cancelCreativeWorkOutput } from "@/server/application/cancel-creative-work-output";
import { generateCreativeWork } from "@/server/application/generate-creative-work";
import { prepareCreativeWork } from "@/server/application/prepare-creative-work";
import { selectCreativeWorkOutputCommand } from "@/server/application/select-creative-work-output";
import {
  createCreativeWorkDraft,
  getCreativeWork,
} from "@/server/repositories/creative-work";
import type { CreativeWorkOutput } from "@/server/db/schema";
import { getClientProfile, getClientProfiles } from "@/server/repositories/client-reference";
import { deriveCreativeWorkTitle } from "@/server/creative-work/prepare";
import type { CreativeWorkFormat, CreativeWorkIntent } from "@/server/creative-work/contracts";
import { auditMcpCall } from "./audit";

/**
 * Handlers das tools MCP, propositadamente SDK-agnósticos: `server.ts` faz
 * o wiring fino ao `@modelcontextprotocol/server`, e estes retornos são
 * testados sem o SDK. Vocabulário canônico (#355): tools em PT-BR snake_case.
 */

export interface McpToolContext {
  workspaceId: string;
  /** Operador em nome de quem o agente age (dono do token). */
  userId: string;
  tokenPrefix: string;
}

export type McpToolResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: string; message: string; details?: unknown };

const PROTOCOLOS: Record<string, CreativeWorkIntent> = {
  single: "single",
  variations: "variations",
  format_adaptation: "format_adaptation",
  restyle: "restyle",
};

const FORMATOS = ["1:1", "4:5", "9:16"] as const;

function mapPeca(output: CreativeWorkOutput): Record<string, unknown> {
  return {
    peca_id: output.id,
    status: output.status,
    formato: output.targetFormat,
    tem_imagem: Boolean(output.outputKey),
    falha: output.failureCode ?? null,
    veredito: output.quality ?? null,
    selecionada: output.isSelected,
    selecionada_por: output.selectedBy ?? null,
  };
}

async function resolveMarca(
  workspaceId: string,
  marca: string
): Promise<{ ok: true; id: string; name: string } | { ok: false; result: Extract<McpToolResult, { ok: false }> }> {
  if (z.string().uuid().safeParse(marca).success) {
    const profile = await getClientProfile(workspaceId, marca);
    if (!profile) {
      return {
        ok: false,
        result: { ok: false, code: "marca_nao_encontrada", message: `Marca ${marca} não existe neste workspace.` },
      };
    }
    return { ok: true, id: profile.id, name: profile.name };
  }
  const profiles = await getClientProfiles(workspaceId);
  const matches = profiles.filter(
    (profile) => profile.name.toLowerCase() === marca.toLowerCase()
  );
  if (matches.length === 1) {
    return { ok: true, id: matches[0].id, name: matches[0].name };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "marca_ambigua",
        message: `Há ${matches.length} marcas chamadas "${marca}". Use o id.`,
        details: { candidatas: matches.map((match) => ({ id: match.id, nome: match.name })) },
      },
    };
  }
  return {
    ok: false,
    result: {
      ok: false,
      code: "marca_nao_encontrada",
      message: `Marca "${marca}" não existe neste workspace.`,
      details: { marcas: profiles.map((profile) => ({ id: profile.id, nome: profile.name })) },
    },
  };
}

export async function criarTrabalho(
  ctx: McpToolContext,
  args: {
    marca: string;
    pedido: string;
    protocolo?: string;
    formato?: string;
    formatos_destino?: string[];
  }
): Promise<McpToolResult> {
  const fail = (result: Extract<McpToolResult, { ok: false }>): McpToolResult => {
    void auditMcpCall({ ...ctx, tool: "criar_trabalho", ok: false });
    return result;
  };
  const marca = await resolveMarca(ctx.workspaceId, args.marca);
  if (!marca.ok) return fail(marca.result);

  const protocolo = PROTOCOLOS[args.protocolo ?? "single"];
  if (!protocolo) {
    return fail({
      ok: false,
      code: "protocolo_desconhecido",
      message: `Protocolo "${args.protocolo}" desconhecido. Use: ${Object.keys(PROTOCOLOS).join(", ")}.`,
    });
  }
  const formato = (FORMATOS as readonly string[]).includes(args.formato ?? "4:5")
    ? ((args.formato ?? "4:5") as CreativeWorkFormat)
    : null;
  if (!formato) {
    return fail({
      ok: false,
      code: "formato_desconhecido",
      message: `Formato "${args.formato}" desconhecido. Use: ${FORMATOS.join(", ")}.`,
    });
  }

  const work = await createCreativeWorkDraft({
    workspaceId: ctx.workspaceId,
    clientProfileId: marca.id,
    createdByUserId: ctx.userId,
    draftKey: randomUUID(),
    intent: protocolo,
    title: deriveCreativeWorkTitle(args.pedido),
    request: args.pedido,
    format: formato,
    settings: { targetFormats: (args.formatos_destino ?? []) as CreativeWorkFormat[] },
  });
  if (!work) {
    return fail({ ok: false, code: "marca_nao_encontrada", message: `Marca "${marca.name}" não existe neste workspace.` });
  }
  void auditMcpCall({ ...ctx, tool: "criar_trabalho", ok: true, target: { trabalho_id: work.id } });
  return {
    ok: true,
    data: {
      trabalho_id: work.id,
      titulo: work.title,
      marca: marca.name,
      protocolo,
      formato,
    },
  };
}

const PREPARE_MESSAGES: Record<string, string> = {
  work_not_found: "Trabalho não encontrado.",
  work_not_draft: "Este Trabalho já saiu do rascunho.",
  missing_input: "O pedido está vazio e não há fontes. Crie o Trabalho com um pedido.",
  sources_not_ready: "Há fontes ainda em análise. Aguarde e tente de novo.",
  brand_conflict: "Conflito de marca: só o operador pode escolher entre a marca ativa e a detectada.",
  calibration_managed: "Trabalho de calibração: só o fluxo de calibração gera aqui.",
};

export async function gerarPeca(
  ctx: McpToolContext,
  args: { trabalho_id: string }
): Promise<McpToolResult> {
  const fail = (result: Extract<McpToolResult, { ok: false }>): McpToolResult => {
    void auditMcpCall({ ...ctx, tool: "gerar_peca", ok: false, target: { trabalho_id: args.trabalho_id } });
    return result;
  };
  const aggregate = await getCreativeWork(ctx.workspaceId, args.trabalho_id);
  if (!aggregate) {
    return fail({ ok: false, code: "trabalho_nao_encontrado", message: "Trabalho não encontrado." });
  }
  if (aggregate.outputs.length > 0) {
    return fail({
      ok: false,
      code: "trabalho_ja_gerado",
      message: "Este Trabalho já tem Peças. Liste e selecione as existentes.",
      details: { pecas: aggregate.outputs.map((output) => ({ peca_id: output.id, status: output.status })) },
    });
  }

  let work = aggregate.work;
  if (!work.brief || !work.copy || !work.inputSnapshot) {
    const prepared = await prepareCreativeWork({
      workspaceId: ctx.workspaceId,
      workItemId: args.trabalho_id,
    });
    if (!prepared.ok) {
      const code = (prepared.error as { code: string }).code;
      return fail({
        ok: false,
        code: `preparo_${code}`,
        message: PREPARE_MESSAGES[code] ?? `Preparo falhou (${code}).`,
        details: (prepared.error as { details?: unknown }).details ?? null,
      });
    }
    const reloaded = await getCreativeWork(ctx.workspaceId, args.trabalho_id);
    if (!reloaded) {
      return fail({ ok: false, code: "trabalho_nao_encontrado", message: "Trabalho não encontrado." });
    }
    work = reloaded.work;
  }

  const generated = await generateCreativeWork({
    workspaceId: ctx.workspaceId,
    workItemId: args.trabalho_id,
    userId: ctx.userId,
    preparedRevision: work.updatedAt.toISOString(),
  });
  if (!generated.ok) {
    const code = generated.error.code;
    const message =
      code === "credit_blocked"
        ? "Sem créditos no workspace para gerar."
        : code === "dispatch_failed"
          ? "Fila de geração indisponível. Tente de novo em instantes."
          : code === "stale_input"
            ? "O Trabalho mudou durante o preparo. Tente gerar de novo."
            : code === "work_not_prepared"
              ? "Preparo incompleto. Tente gerar de novo."
              : `Geração falhou (${code}).`;
    return fail({ ok: false, code: `geracao_${code}`, message, details: generated.error.details ?? null });
  }

  void auditMcpCall({ ...ctx, tool: "gerar_peca", ok: true, target: { trabalho_id: args.trabalho_id } });
  return {
    ok: true,
    data: {
      trabalho_id: args.trabalho_id,
      pecas: generated.value.outputs.map((output) => ({ peca_id: output.id, status: output.status })),
      dica_poll: "A geração é assíncrona. Use listar_pecas ou leia o resource peca até status completed/failed.",
    },
  };
}

export async function listarPecas(
  ctx: McpToolContext,
  args: { trabalho_id: string }
): Promise<McpToolResult> {
  const aggregate = await getCreativeWork(ctx.workspaceId, args.trabalho_id);
  if (!aggregate) {
    const result: McpToolResult = { ok: false, code: "trabalho_nao_encontrado", message: "Trabalho não encontrado." };
    void auditMcpCall({ ...ctx, tool: "listar_pecas", ok: false, target: { trabalho_id: args.trabalho_id } });
    return result;
  }
  void auditMcpCall({ ...ctx, tool: "listar_pecas", ok: true, target: { trabalho_id: args.trabalho_id } });
  return {
    ok: true,
    data: {
      trabalho_id: args.trabalho_id,
      status_trabalho: aggregate.work.status,
      pecas: aggregate.outputs.map(mapPeca),
    },
  };
}

export async function selecionarPeca(
  ctx: McpToolContext,
  args: { trabalho_id: string; peca_id: string }
): Promise<McpToolResult> {
  const fail = (result: Extract<McpToolResult, { ok: false }>): McpToolResult => {
    void auditMcpCall({ ...ctx, tool: "selecionar_peca", ok: false, target: { trabalho_id: args.trabalho_id, peca_id: args.peca_id } });
    return result;
  };
  const result = await selectCreativeWorkOutputCommand({
    workspaceId: ctx.workspaceId,
    workItemId: args.trabalho_id,
    outputId: args.peca_id,
    selectedBy: "agent",
  });
  if (!result.ok) {
    const code = result.error.code;
    const message =
      code === "objective_selection_blocked"
        ? "Reprovação objetiva: esta Peça não pode ser selecionada, nem pelo operador."
        : code === "objective_confirmation_required"
          ? "Veredito inconclusivo: só o operador pode confirmar esta Peça."
          : code === "output_not_selectable"
            ? `Peça ainda não selecionável (status ${(result.error as { status?: string }).status ?? "?"}). Aguarde completar.`
            : code === "output_not_found"
              ? "Peça não encontrada neste Trabalho."
              : code === "work_not_found"
                ? "Trabalho não encontrado."
                : code === "calibration_managed"
                  ? "Peça de calibração: seleção só pelo fluxo de calibração."
                  : `Seleção falhou (${code}).`;
    return fail({ ok: false, code: `selecao_${code}`, message });
  }
  void auditMcpCall({ ...ctx, tool: "selecionar_peca", ok: true, target: { trabalho_id: args.trabalho_id, peca_id: args.peca_id } });
  return {
    ok: true,
    data: {
      peca_id: args.peca_id,
      selecionada: true,
      selecionada_por: "agent",
      efeitos_pulados: ["biblioteca", "metricas", "receita_visual"],
      nota: "Seleção por agente, não Aprovação humana. O operador confirma depois.",
    },
  };
}

export async function cancelarPeca(
  ctx: McpToolContext,
  args: { trabalho_id: string; peca_id: string }
): Promise<McpToolResult> {
  const result = await cancelCreativeWorkOutput({
    workspaceId: ctx.workspaceId,
    workItemId: args.trabalho_id,
    outputId: args.peca_id,
    userId: ctx.userId,
  });
  if (!result.ok) {
    const failure: McpToolResult = {
      ok: false,
      code: `cancelamento_${result.error.code}`,
      message:
        result.error.code === "output_not_cancellable"
          ? `Peça não cancelável (status ${result.error.status ?? "?"}). Só pendentes cancelam.`
          : result.error.code === "output_not_found"
            ? "Peça não encontrada neste Trabalho."
            : "Trabalho não encontrado.",
    };
    void auditMcpCall({ ...ctx, tool: "cancelar_peca", ok: false, target: { trabalho_id: args.trabalho_id, peca_id: args.peca_id } });
    return failure;
  }
  void auditMcpCall({ ...ctx, tool: "cancelar_peca", ok: true, target: { trabalho_id: args.trabalho_id, peca_id: args.peca_id } });
  return { ok: true, data: { peca_id: args.peca_id, cancelada: true, reembolsada: result.value.refunded } };
}

export async function lerTrabalho(
  ctx: McpToolContext,
  trabalhoId: string
): Promise<McpToolResult> {
  const aggregate = await getCreativeWork(ctx.workspaceId, trabalhoId);
  if (!aggregate) {
    return { ok: false, code: "trabalho_nao_encontrado", message: "Trabalho não encontrado." };
  }
  return {
    ok: true,
    data: {
      trabalho_id: aggregate.work.id,
      titulo: aggregate.work.title,
      pedido: aggregate.work.request,
      protocolo: aggregate.work.toolKind,
      formato: aggregate.work.format,
      status: aggregate.work.status,
      marca_id: aggregate.work.clientProfileId,
      pecas: aggregate.outputs.map(mapPeca),
    },
  };
}

export async function lerPeca(
  ctx: McpToolContext,
  trabalhoId: string,
  pecaId: string
): Promise<McpToolResult> {
  const aggregate = await getCreativeWork(ctx.workspaceId, trabalhoId);
  const output = aggregate?.outputs.find((candidate) => candidate.id === pecaId);
  if (!aggregate || !output) {
    return { ok: false, code: "peca_nao_encontrada", message: "Peça não encontrada neste Trabalho." };
  }
  return {
    ok: true,
    data: {
      trabalho_id: aggregate.work.id,
      status_trabalho: aggregate.work.status,
      ...mapPeca(output),
    },
  };
}
