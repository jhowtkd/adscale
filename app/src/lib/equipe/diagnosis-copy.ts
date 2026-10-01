/**
 * Fixed phrases of the free diagnosis. They are persisted in the conversation
 * (suggestions, feed lines), so they are written once, in pt-BR; the UI chrome
 * around them is localized with next-intl.
 */
export const DIAGNOSIS_CARD_TITLE = "Diagnóstico da marca";
export const DIAGNOSIS_RETRY_PHRASE = "Tentar de novo";
export const DIAGNOSIS_CORRECT_SOURCE_PHRASE = "Corrigir ou acrescentar meu site ou @";
export const DIAGNOSIS_NOT_FOUND_PHRASE = "O que não foi encontrado?";
export const DIAGNOSIS_CALENDAR_PHRASE = "Montar o calendário do mês";
export const DIAGNOSIS_PLAN_PHRASE = "O que muda com o plano?";
export const DIAGNOSIS_BUILDING_TEXT = "Montando o diagnóstico da sua marca. Você pode sair: aviso quando estiver pronto.";

export type DiagnosisCardStatus = "ready" | "insufficient" | "failed";

function explainOpportunity(count: number) {
  return count > 1 ? "Me explica a oportunidade 1" : "Me explica a oportunidade";
}

/** Deterministic suggestions: the diagnosis card never calls a model, so its iscas are fixed. */
export function diagnosisSuggestions(state:
  | { status: "ready"; opportunities: number; notFound: number }
  | { status: "insufficient"; readsLeft: boolean }
  | { status: "failed"; retryable: boolean }): string[] {
  if (state.status === "ready") {
    return [explainOpportunity(state.opportunities), ...(state.notFound > 0 ? [DIAGNOSIS_NOT_FOUND_PHRASE] : []), DIAGNOSIS_CALENDAR_PHRASE];
  }
  if (state.status === "insufficient") return [...(state.readsLeft ? [DIAGNOSIS_CORRECT_SOURCE_PHRASE] : []), DIAGNOSIS_PLAN_PHRASE];
  return state.retryable ? [DIAGNOSIS_RETRY_PHRASE] : [];
}

function normalized(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s.!?]+$/g, "").trim().toLowerCase();
}

/** A message that is exactly one of these phrases is handled by the server, without a model call. */
export function isDiagnosisPhrase(text: string, phrase: string) {
  return normalized(text) === normalized(phrase);
}
