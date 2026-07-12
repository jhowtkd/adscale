/**
 * Funil canônico de trabalho criativo.
 *
 * Define o vocabulário único de eventos que descreve uma jornada de
 * trabalho criativo, independentemente da origem (Campanha, Assistente,
 * Quick Tools / Criar Post).
 *
 * Esta é uma camada de constantes pura. Não altera comportamento —
 * apenas nomeia os estágios do funil para que telemetry, baseline e
 * métricas de produto concordem sobre o que cada etapa significa.
 *
 * Plano de convergência, Fase 0, passo 3:
 * docs/plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md
 */

/**
 * Origem declarada do trabalho criativo.
 *
 * Usada para segmentar baseline e métricas por jornada de entrada.
 * Não muda regras de negócio — apenas classifica a entrada.
 */
export const CREATIVE_WORK_ORIGINS = [
  "campaign",
  "assistant",
  "quick_tool",
] as const;

export type CreativeWorkOrigin = (typeof CREATIVE_WORK_ORIGINS)[number];

/**
 * Eventos canônicos do funil de trabalho criativo.
 *
 * A sequência esperada é:
 *   started → briefing_ready → generation_confirmed → output_ready
 *           → reviewed → approved → delivered
 *
 * `abandoned` e `failed` são terminais negativos possíveis a partir de
 * qualquer etapa. `reopened` sinaliza retomada após reload/outra interface.
 */
export const CREATIVE_WORK_FUNNEL_EVENTS = [
  "creative_work_started",
  "briefing_ready",
  "generation_confirmed",
  "output_ready",
  "creative_work_reviewed",
  "creative_work_approved",
  "creative_work_delivered",
  "creative_work_abandoned",
  "creative_work_failed",
  "creative_work_reopened",
] as const;

export type CreativeWorkFunnelEvent =
  (typeof CREATIVE_WORK_FUNNEL_EVENTS)[number];

/**
 * Estágios lógicos do funil, derivados dos eventos.
 *
 * Um trabalho está em exatamente um estágio em um dado momento.
 * Mapeia para o schema de status existente quando aplicável.
 */
export const CREATIVE_WORK_FUNNEL_STAGES = [
  "intending", // iniciado, briefing incompleto
  "briefing", // briefing pronto, antes de confirmar geração
  "generating", // geração confirmada, sem output ainda
  "reviewing", // output pronto, sem decisão
  "approved", // versão aprovada, sem entrega
  "delivered", // pacote de entrega preparado
  "abandoned",
  "failed",
] as const;

export type CreativeWorkFunnelStage =
  (typeof CREATIVE_WORK_FUNNEL_STAGES)[number];

/**
 * Mapeia evento → estágio resultante.
 *
 * Fonte de verdade para derivar o estágio atual a partir do último
 * evento observado. Quando a Fase 2 introduzir o contrato canônico,
 * a projeção do estado usará esta tabela.
 */
export const STAGE_AFTER_EVENT: Record<
  CreativeWorkFunnelEvent,
  CreativeWorkFunnelStage
> = {
  creative_work_started: "intending",
  briefing_ready: "briefing",
  generation_confirmed: "generating",
  output_ready: "reviewing",
  creative_work_reviewed: "reviewing",
  creative_work_approved: "approved",
  creative_work_delivered: "delivered",
  creative_work_abandoned: "abandoned",
  creative_work_failed: "failed",
  creative_work_reopened: "intending",
};

/**
 * Mapeia origem + evento existente (vocabulary atual) para o evento
 * canônico equivalente. Usado pela telemetria comparativa da Fase 2
 * (passo 18) sem reescrever os emitters atuais.
 *
 * `null` significa "sem equivalência canônica direta" — por exemplo,
 * eventos de UI que não compõem o funil de produto.
 */
export const LEGACY_TO_CANONICAL_EVENT: Record<string, CreativeWorkFunnelEvent | null> =
  {
    // guided-flow telemetry (Assistente)
    guided_flow_started: "creative_work_started",
    guided_flow_completed: "creative_work_approved",
    guided_flow_abandoned: "creative_work_abandoned",

    // cockpit / beta-analytics (Campanha)
    cockpit_stage_entered: null,
    cockpit_stage_completed: "output_ready",
    cockpit_stage_abandoned: "creative_work_abandoned",
    mission_completed: "creative_work_delivered",
    readiness_completed: "briefing_ready",

    // derivations / generation (comum)
    "image.generation.candidates": "generation_confirmed",
  };

/**
 * Tipo guard utilitário para validar strings como evento canônico.
 */
export function isCreativeWorkFunnelEvent(
  value: unknown
): value is CreativeWorkFunnelEvent {
  return (
    typeof value === "string" &&
    (CREATIVE_WORK_FUNNEL_EVENTS as readonly string[]).includes(value)
  );
}

/**
 * Tipo guard utilitário para validar strings como origem canônica.
 */
export function isCreativeWorkOrigin(
  value: unknown
): value is CreativeWorkOrigin {
  return (
    typeof value === "string" &&
    (CREATIVE_WORK_ORIGINS as readonly string[]).includes(value)
  );
}
