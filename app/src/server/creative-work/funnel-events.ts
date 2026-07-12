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
 * Regra de mapeamento de um evento legacy para um evento canônico.
 *
 * - `canonical`: evento canônico equivalente, ou `null` quando não há
 *   equivalência direta (ex.: evento de UI pura).
 * - `when`: predicado opcional sobre o registro legacy (origem +
 *   metadata) que deve retornar true para o mapeamento valer. Quando o
 *   predicado retornar false, o evento legacy fica `unmapped` em vez de
 *   ser classificado erroneamente.
 *
 * Isto evita que eventos com mesmo nome mas significados diferentes
 * (ex.: `mission_completed` para QA, review, export, share) sejam
 * contados como entrega criativa.
 */
export interface LegacyEventMapping {
  readonly canonical: CreativeWorkFunnelEvent | null;
  readonly when?: (record: {
    readonly origin?: CreativeWorkOrigin | string | null;
    readonly metadata?: Record<string, unknown> | null;
  }) => boolean;
}

/**
 * Record do evento legacy recebido pelo mapper.
 */
export interface LegacyEventRecord {
  readonly eventKey: string;
  readonly origin?: CreativeWorkOrigin | string | null;
  readonly metadata?: Record<string, unknown> | null;
}

/**
 * `missionKey` (beta-analytics) que identifica unicamente uma entrega
 * criativa. Outros missionKeys (qa, review, export, share, ...) não
 * são entrega e ficam `unmapped`.
 */
const CREATIVE_DELIVERY_MISSION_KEYS = new Set([
  "creative_delivery",
  "delivery_package",
  "deliver_creatives",
]);

/**
 * Mapeia um registro legacy para um evento canônico.
 *
 * Retorno:
 *   - evento canônico quando há mapeamento e o predicado (se houver) passa;
 *   - `null` quando o mapeamento existe mas o predicado falha (evento
 *     intencionalmente unmapped, ex.: mission_completed de QA);
 *   - `null` quando não há mapeamento algum.
 *
 * Use `classifyLegacyEvent()` para distinguir os dois casos `null`.
 */
export function mapLegacyEvent(
  record: LegacyEventRecord
): CreativeWorkFunnelEvent | null {
  const rule = LEGACY_EVENT_MAP[record.eventKey];
  if (!rule) return null;
  if (rule.when && !rule.when(record)) return null;
  return rule.canonical;
}

/**
 * Classificação explícita que distingue "sem mapeamento" de
 * "mapeamento existe mas não se aplica a este registro".
 */
export type LegacyMappingOutcome =
  | { kind: "mapped"; event: CreativeWorkFunnelEvent }
  | { kind: "unmapped_inapplicable"; reason: string }
  | { kind: "unmapped_unknown"; reason: string };

export function classifyLegacyEvent(
  record: LegacyEventRecord
): LegacyMappingOutcome {
  const rule = LEGACY_EVENT_MAP[record.eventKey];
  if (!rule) {
    return {
      kind: "unmapped_unknown",
      reason: `no mapping declared for event "${record.eventKey}"`,
    };
  }
  if (rule.when && !rule.when(record)) {
    return {
      kind: "unmapped_inapplicable",
      reason: `event "${record.eventKey}" present but predicate rejected this record (e.g. wrong missionKey/origin/metadata)`,
    };
  }
  if (rule.canonical === null) {
    return {
      kind: "unmapped_inapplicable",
      reason: `event "${record.eventKey}" is intentionally UI-only and has no canonical equivalent`,
    };
  }
  return { kind: "mapped", event: rule.canonical };
}

/**
 * Tabela de regras legacy → canônico. Adicione aqui à medida que novos
 * emitters forem identificados; nunca passe um evento ambíguo sem um
 * predicado `when`.
 */
export const LEGACY_EVENT_MAP: Record<string, LegacyEventMapping> = {
  // guided-flow telemetry (Assistente)
  guided_flow_started: { canonical: "creative_work_started" },
  guided_flow_completed: {
    canonical: "creative_work_approved",
    when: ({ origin }) => origin === "assistant",
  },
  guided_flow_abandoned: { canonical: "creative_work_abandoned" },

  // cockpit / beta-analytics (Campanha)
  cockpit_stage_entered: { canonical: null },
  cockpit_stage_completed: { canonical: "output_ready" },
  cockpit_stage_abandoned: { canonical: "creative_work_abandoned" },
  readiness_completed: { canonical: "briefing_ready" },

  // mission_completed é deliberadamente NÃO mapeado por padrão. Só vira
  // creative_work_delivered quando o missionKey dentro de metadata for um
  // dos identificadores de entrega criativa. Caso contrário fica
  // unmapped_inapplicable (qa, review, export, share, etc.).
  mission_completed: {
    canonical: "creative_work_delivered",
    when: ({ metadata }) => {
      const missionKey = metadata?.missionKey;
      return (
        typeof missionKey === "string" &&
        CREATIVE_DELIVERY_MISSION_KEYS.has(missionKey)
      );
    },
  },

  // derivations / generation (comum) — confirmação de geração é o ponto
  // em que o custo foi debitado e o pipeline foi acionado.
  "image.generation.candidates": { canonical: "generation_confirmed" },
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
