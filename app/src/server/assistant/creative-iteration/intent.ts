const VISUAL_KEYWORDS =
  /\b(cor|layout|imagem|fundo|foto|visual|tipografia|fonte|cor de fundo|paleta|contraste|brilho|sombra|border|borda|ícone|icone)\b/i;

const PLAN_KEYWORDS =
  /\b(plano|estratégia|estrategia|ângulo|angulo|hook|cta|restr|público|publico|audiência|audiencia|oferta|produto|briefing)\b/i;

const GENERIC_REVISE_HINTS = /\b(revis|ajust|mud|alter|troc|melhor)/i;

export type CreativeRevisionIntent =
  | { kind: "creative" }
  | { kind: "plan" }
  | { kind: "ambiguous" }
  | { kind: "continue" };

export function classifyCreativeRevisionIntent(
  message: string
): CreativeRevisionIntent {
  const trimmed = message.trim();
  if (!trimmed) return { kind: "continue" };

  const hasVisual = VISUAL_KEYWORDS.test(trimmed);
  const hasPlan = PLAN_KEYWORDS.test(trimmed);

  if (hasVisual && hasPlan) {
    return { kind: "ambiguous" };
  }
  if (hasVisual) {
    return { kind: "creative" };
  }
  if (hasPlan) {
    return { kind: "plan" };
  }

  if (GENERIC_REVISE_HINTS.test(trimmed)) {
    return { kind: "ambiguous" };
  }

  return { kind: "continue" };
}
