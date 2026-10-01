/** Suggestions are conversation starters, never decisions or approvals. */
export function filterSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const valid = value.filter((item): item is string => {
    if (typeof item !== "string" || !item.trim() || Array.from(item.trim()).length > 60) return false;
    const text = item.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return !/\b(aprov(?:[oa]|em?)|aprovad[oa]s?|aprova(?:r|cao|coes)|confirm(?:[oa]|em?|ar|ad[oa]s?|acao|acoes|ed|ation)?|autoriz(?:[oa]|em?|ar|ad[oa]s?|acao|acoes)|publiquem?|approve[ds]?|authoriz(?:e[ds]?|ation)|publish)\b|\bpode\s+(postar|publicar|subir|mandar|enviar|colocar\s+no\s+ar)\b/.test(text);
  }).map((item) => item.trim());
  return [...new Set(valid)].slice(0, 3);
}

export const EMPTY_SCREEN_SUGGESTIONS = {
  library: ["O que falta na minha Biblioteca?", "Como organizar os materiais da minha marca?"],
  creations: ["Montar o calendário do mês", "O que muda com o plano?"],
  ideas: ["Me explica as oportunidades do diagnóstico", "Por onde posso começar?"],
  goals: ["Quais objetivos fazem sentido para minha marca?", "O que muda com o plano?"],
} as const;

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * `/?suggestion=` sends the phrase for the person, so only the fixed phrases of the empty screens are accepted: a link
 * can never make someone send text it wrote.
 */
export function isCatalogSuggestion(text: string | null | undefined): text is string {
  if (!text) return false;
  const wanted = fold(text);
  return Object.values(EMPTY_SCREEN_SUGGESTIONS).some((phrases) => phrases.some((phrase) => fold(phrase) === wanted));
}
