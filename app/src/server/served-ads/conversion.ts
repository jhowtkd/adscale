/**
 * Medição de conversão versionada por evento (ICE-01A, spec #383).
 * Funções puras: uma conversão precisa ter uma definição explícita.
 * Nunca somam tipos distintos; nulo nunca é zero.
 */

export const CONVERSION_DEFINITION_VERSION = 2;

export type ConversionStatus =
  | "measured"
  | "not_defined"
  | "incomplete"
  | "incompatible"
  | "legacy_unverified";

export interface ConversionMeasure {
  definitionVersion: 2;
  actionType: string | null;
  value: number | null;
  status: ConversionStatus;
}

export interface ActionCount {
  actionType: string;
  value: number;
}

/**
 * Equivalência documentada e validada entre alias e tipo canônico.
 * Sem `documentedIn`, a regra não vale — o alias não se soma.
 */
export interface AliasRule {
  alias: string;
  canonical: string;
  documentedIn: string;
}

export type MeasurementOrigin = "real" | "mock";

export type AttributionRef =
  | { status: "known"; spec: string }
  | { status: "unknown"; condition: string };

/** Metadados de comparabilidade: validados antes de qualquer agregação. */
export interface ComparabilityContext {
  definitionVersion: number;
  currency: string;
  /** Período absoluto da coleta (ISO). */
  periodStart: string;
  periodEnd: string;
  /** Janela solicitada em dias. */
  windowDays: number;
  attribution: AttributionRef;
  completeness: "complete" | "partial";
  origin: MeasurementOrigin;
}

/** Registro de uma coleta: o que foi medido, quando e sob quais condições. */
export interface ConversionSnapshot extends ComparabilityContext {
  collectedAt: string;
}

function baseMeasure(actionType: string | null, status: ConversionStatus, value: number | null): ConversionMeasure {
  return { definitionVersion: CONVERSION_DEFINITION_VERSION, actionType, value, status };
}

/** Linha legada sem definição: exibida como não validada, sem CPA, sem comparação com v2. */
export function legacyMeasure(): ConversionMeasure {
  return baseMeasure(null, "legacy_unverified", null);
}

export interface MeasureConversionInput {
  /** Tipo de ação explícito da seleção de métrica; null = não escolhido. */
  actionType: string | null;
  /** Entradas brutas como coletadas, sem soma prévia. */
  actions: ActionCount[];
  /** Resposta observada como completa. */
  complete: boolean;
  /**
   * Validação registrada de que, para este endpoint e configuração, tipo
   * ausente significa zero. Sem ela, ausência é leitura parcial — nunca zero.
   */
  absentMeansZero?: boolean;
  aliasRules?: AliasRule[];
  /**
   * Tipos com conflito na normalização da coleta (mesmo tipo, valores
   * distintos). Medir um deles é incompatível até resolução.
   */
  ambiguousTypes?: string[];
}

export function measureConversion(input: MeasureConversionInput): ConversionMeasure {
  const actionType = input.actionType?.trim() ? input.actionType : null;
  if (!actionType) return baseMeasure(null, "not_defined", null);
  if (!input.complete) return baseMeasure(actionType, "incomplete", null);

  const rules = new Map<string, string>();
  for (const rule of input.aliasRules ?? []) {
    if (rule.documentedIn.trim()) rules.set(rule.alias, rule.canonical);
  }
  const canonicalOf = (type: string): string => rules.get(type) ?? type;
  const ambiguous = new Set((input.ambiguousTypes ?? []).map(canonicalOf));
  if (ambiguous.has(canonicalOf(actionType))) {
    return baseMeasure(actionType, "incompatible", null);
  }

  const values = new Map<string, number>();
  for (const entry of input.actions) {
    if (!Number.isFinite(entry.value) || entry.value < 0) {
      return baseMeasure(actionType, "incompatible", null);
    }
    const canonical = canonicalOf(entry.actionType);
    const seen = values.get(canonical);
    if (seen !== undefined && seen !== entry.value) {
      return baseMeasure(actionType, "incompatible", null);
    }
    values.set(canonical, entry.value);
  }

  const target = canonicalOf(actionType);
  if (!values.has(target)) {
    if (input.absentMeansZero) return baseMeasure(actionType, "measured", 0);
    return baseMeasure(actionType, "incomplete", null);
  }
  return baseMeasure(actionType, "measured", values.get(target) ?? null);
}

/**
 * CPA só existe com status medido, denominador positivo e gasto válido.
 * Qualquer outra coisa — inclusive zero conversões — é ausência, nunca zero.
 */
export function deriveCpa(measure: ConversionMeasure, spend: number): number | null {
  if (measure.status !== "measured" || measure.value == null) return null;
  if (!Number.isFinite(spend) || spend < 0 || measure.value <= 0) return null;
  return spend / measure.value;
}

function sameAttribution(a: AttributionRef, b: AttributionRef): boolean {
  if (a.status !== b.status) return false;
  return a.status === "known" && b.status === "known"
    ? a.spec === b.spec
    : (a as { condition: string }).condition === (b as { condition: string }).condition;
}

export type CompatibilityCheck = { ok: true } | { ok: false; reason: string };

/**
 * Duas linhas só agregam com mesma definição, moeda, período absoluto,
 * janela, atribuição, completude total e origem. Contextos distintos de
 * atribuição não se tornam comparáveis por dizerem "7 dias".
 */
export function assertCompatibleLines(lines: ComparabilityContext[]): CompatibilityCheck {
  const [first, ...rest] = lines;
  if (!first) return { ok: true };
  for (const line of rest) {
    if (line.definitionVersion !== first.definitionVersion) {
      return { ok: false, reason: "definition_version_mismatch" };
    }
    if (line.currency !== first.currency) return { ok: false, reason: "currency_mismatch" };
    if (line.periodStart !== first.periodStart || line.periodEnd !== first.periodEnd) {
      return { ok: false, reason: "period_mismatch" };
    }
    if (line.windowDays !== first.windowDays) return { ok: false, reason: "window_mismatch" };
    if (!sameAttribution(line.attribution, first.attribution)) {
      return { ok: false, reason: "attribution_mismatch" };
    }
    if (line.completeness !== "complete" || first.completeness !== "complete") {
      return { ok: false, reason: "incomplete_line" };
    }
    if (line.origin !== first.origin) return { ok: false, reason: "origin_mismatch" };
  }
  return { ok: true };
}

export interface AggregationLine {
  actionType: string;
  value: number;
  context: ComparabilityContext;
}

/** Soma somente o mesmo tipo dentro de linhas compatíveis. */
export function aggregateMeasures(lines: AggregationLine[]): ConversionMeasure {
  const [first, ...rest] = lines;
  if (!first) return baseMeasure(null, "not_defined", null);
  for (const line of lines) {
    if (!Number.isFinite(line.value) || line.value < 0) {
      return baseMeasure(first.actionType, "incompatible", null);
    }
  }
  if (!rest.every((line) => line.actionType === first.actionType)) {
    return baseMeasure(first.actionType, "incompatible", null);
  }
  const compatibility = assertCompatibleLines(lines.map((line) => line.context));
  if (!compatibility.ok) return baseMeasure(first.actionType, "incompatible", null);
  return baseMeasure(first.actionType, "measured", lines.reduce((sum, line) => sum + line.value, 0));
}

export interface ConsolidationLine extends AggregationLine {
  spend: number;
}

/**
 * CPA consolidado = gasto compatível / conversões do evento escolhido.
 * Nunca média simples de CPAs; nunca mistura contextos.
 */
export function consolidateCpa(lines: ConsolidationLine[]): number | null {
  const [first] = lines;
  if (!first) return null;
  for (const line of lines) {
    if (!Number.isFinite(line.spend) || line.spend < 0) return null;
  }
  const total = aggregateMeasures(lines);
  if (total.status !== "measured" || total.value == null) return null;
  const spend = lines.reduce((sum, line) => sum + line.spend, 0);
  return deriveCpa({ ...total, actionType: first.actionType }, spend);
}
