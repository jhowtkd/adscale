/**
 * Checker da limpeza leve do Ditado (#351).
 *
 * Teste de aceitação: toda palavra de conteúdo do texto limpo existe no
 * bruto, na mesma ordem. Como a limpeza só pode remover (hesitações,
 * muletas, repetições imediatas) e ajustar pontuação/capitalização, o texto
 * limpo normalizado é sempre uma subsequência do bruto normalizado.
 * Reordenar, resumir, traduzir, trocar palavras, completar frases ou
 * resolver autocorreções quebra a subsequência e reprova.
 */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

export interface CheckerResult {
  ok: boolean;
  /** Primeira palavra do limpo que quebrou a ordem (telemetria). */
  offendingWord?: string;
}

export function checkLightCleanup(raw: string, clean: string): CheckerResult {
  const rawTokens = tokenize(raw);
  const cleanTokens = tokenize(clean);

  if (rawTokens.length === 0 || cleanTokens.length === 0) {
    return { ok: false };
  }

  let cursor = 0;
  for (const word of cleanTokens) {
    let found = false;
    while (cursor < rawTokens.length) {
      if (rawTokens[cursor] === word) {
        found = true;
        cursor += 1;
        break;
      }
      cursor += 1;
    }
    if (!found) {
      return { ok: false, offendingWord: word };
    }
  }
  return { ok: true };
}

/**
 * Decide o texto final do ditado. `candidate` é a saída da limpeza leve
 * (null quando o passo de limpeza falhou ou voltou vazio).
 * Sem candidato válido, o bruto segue — editável pelo operador — com
 * `cleaned: false` (o checker passaria trivialmente em texto idêntico).
 */
export function resolveCleanText(
  raw: string,
  candidate: string | null
): { text: string; cleaned: boolean; offendingWord?: string } {
  if (!candidate) {
    return { text: raw, cleaned: false };
  }
  const check = checkLightCleanup(raw, candidate);
  if (!check.ok) {
    return { text: raw, cleaned: false, offendingWord: check.offendingWord };
  }
  return { text: candidate, cleaned: true };
}
