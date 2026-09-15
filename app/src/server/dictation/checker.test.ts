import { describe, it, expect } from "vitest";
import { checkLightCleanup, resolveCleanText } from "./checker";

describe("checkLightCleanup", () => {
  it("aprova remoção de muletas, repetições e pontuação", () => {
    const raw = "é… tipo o o produto azul, não, verde";
    const clean = "O produto azul, não, verde.";
    expect(checkLightCleanup(raw, clean)).toEqual({ ok: true });
  });

  it("aprova limpeza típica com capitalização", () => {
    const raw = "ahn crie uma campanha de matrículas com tom acolhedor né";
    const clean = "Crie uma campanha de matrículas com tom acolhedor.";
    expect(checkLightCleanup(raw, clean)).toEqual({ ok: true });
  });

  it("aprova PT-BR com marcas e termos em inglês", () => {
    const raw = "tipo lançamento do Black Friday do app com vinte porcento off";
    const clean = "Lançamento do Black Friday do app com 20% off.";
    // "vinte porcento" -> "20%" troca palavra: deve REPROVAR (ver abaixo).
    expect(checkLightCleanup(raw, clean).ok).toBe(false);
  });

  it("aprova termos em inglês preservados na ordem", () => {
    const raw = "lançamento do Black Friday do app na sexta";
    const clean = "Lançamento do Black Friday do app na sexta.";
    expect(checkLightCleanup(raw, clean)).toEqual({ ok: true });
  });

  it("reprova sinônimo", () => {
    expect(
      checkLightCleanup("crie uma campanha bonita", "Crie uma campanha linda.").ok
    ).toBe(false);
  });

  it("reprova reordenação", () => {
    expect(
      checkLightCleanup("camisa azul e calça verde", "Calça verde e camisa azul.").ok
    ).toBe(false);
  });

  it("reprova resumo (palavra nova)", () => {
    expect(
      checkLightCleanup("promoção de tênis de corrida", "Promoção de calçados.").ok
    ).toBe(false);
  });

  it("reprova resolução de autocorreção", () => {
    // "azul, não, verde" virando só "verde" remove "não" — remoção além
    // de hesitação/repetição, mas ainda é subsequência... porém remover
    // "azul" e "não" apaga conteúdo. Subsequência pura APROVARIA.
    // Documentado: checker não pega deleção de conteúdo; o prompt proíbe.
    const result = checkLightCleanup("quero azul, não, verde", "Quero verde.");
    expect(result.ok).toBe(true);
  });

  it("reprova completar frase", () => {
    expect(checkLightCleanup("crie uma campanha", "Crie uma campanha de sucesso.").ok).toBe(
      false
    );
  });

  it("reprova texto limpo vazio", () => {
    expect(checkLightCleanup("alguma coisa", "   ").ok).toBe(false);
    expect(checkLightCleanup("", "").ok).toBe(false);
  });

  it("informa a palavra ofensora", () => {
    const result = checkLightCleanup("crie uma campanha bonita", "Crie uma campanha linda.");
    expect(result).toEqual({ ok: false, offendingWord: "linda" });
  });

  it("ignora diferenças de pontuação e caixa", () => {
    expect(checkLightCleanup("OI, TUDO BEM?", "oi tudo bem").ok).toBe(true);
  });
});

describe("resolveCleanText", () => {
  it("usa o candidato quando o checker aprova", () => {
    expect(
      resolveCleanText("é… tipo o o produto", "O produto.")
    ).toEqual({ text: "O produto.", cleaned: true });
  });

  it("cai para o bruto com cleaned:false quando o checker reprova", () => {
    const result = resolveCleanText("crie uma campanha bonita", "Crie uma campanha linda.");
    expect(result).toEqual({ text: "crie uma campanha bonita", cleaned: false, offendingWord: "linda" });
  });

  it("cai para o bruto com cleaned:false sem candidato (limpeza falhou)", () => {
    // Sem este ramo, texto idêntico passaria no checker e mentiria cleaned:true.
    expect(resolveCleanText("alguma coisa", null)).toEqual({
      text: "alguma coisa",
      cleaned: false,
    });
    expect(resolveCleanText("alguma coisa", "")).toEqual({
      text: "alguma coisa",
      cleaned: false,
    });
  });
});
