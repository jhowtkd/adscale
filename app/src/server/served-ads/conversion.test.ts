import { describe, expect, it } from "vitest";
import {
  aggregateMeasures,
  assertCompatibleLines,
  consolidateCpa,
  deriveCpa,
  legacyMeasure,
  measureConversion,
  type ComparabilityContext,
} from "./conversion";

function context(overrides: Partial<ComparabilityContext> = {}): ComparabilityContext {
  return {
    definitionVersion: 2,
    currency: "BRL",
    periodStart: "2026-08-17T00:00:00.000Z",
    periodEnd: "2026-09-16T00:00:00.000Z",
    windowDays: 30,
    attribution: { status: "known", spec: "7d_click_1d_view" },
    completeness: "complete",
    origin: "real",
    ...overrides,
  };
}

describe("measureConversion (ICE-01A)", () => {
  it("mede um tipo de ação explícito sem somar os demais", () => {
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [
          { actionType: "purchase", value: 4 },
          { actionType: "lead", value: 10 },
          { actionType: "link_click", value: 500 },
        ],
        complete: true,
      })
    ).toEqual({ definitionVersion: 2, actionType: "purchase", value: 4, status: "measured" });
  });

  it("evento não escolhido não produz medida", () => {
    expect(
      measureConversion({ actionType: null, actions: [{ actionType: "purchase", value: 4 }], complete: true })
    ).toEqual({ definitionVersion: 2, actionType: null, value: null, status: "not_defined" });
  });

  it("resposta incompleta não produz medida", () => {
    expect(
      measureConversion({ actionType: "purchase", actions: [{ actionType: "purchase", value: 4 }], complete: false })
    ).toEqual({ definitionVersion: 2, actionType: "purchase", value: null, status: "incomplete" });
  });

  it("rejeita valor negativo ou não finito como incompatível", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        measureConversion({ actionType: "purchase", actions: [{ actionType: "purchase", value }], complete: true })
      ).toMatchObject({ status: "incompatible", value: null });
    }
  });

  it("duplicação ambígua do mesmo tipo invalida até resolução", () => {
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [
          { actionType: "purchase", value: 4 },
          { actionType: "purchase", value: 5 },
        ],
        complete: true,
      })
    ).toMatchObject({ status: "incompatible", value: null });
  });

  it("tipo ambíguo registrado na coleta invalida a medição", () => {
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [{ actionType: "lead", value: 3 }],
        complete: true,
        ambiguousTypes: ["purchase"],
      })
    ).toMatchObject({ status: "incompatible", value: null });
    // Ambiguidade em outro tipo não contamina o medido.
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [{ actionType: "purchase", value: 4 }],
        complete: true,
        ambiguousTypes: ["lead"],
      })
    ).toMatchObject({ status: "measured", value: 4 });
  });

  it("leitura idempotente do mesmo valor não é duplicação", () => {
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [
          { actionType: "purchase", value: 4 },
          { actionType: "purchase", value: 4 },
        ],
        complete: true,
      })
    ).toMatchObject({ status: "measured", value: 4 });
  });

  it("tipo ausente só vira zero com validação registrada", () => {
    expect(
      measureConversion({ actionType: "purchase", actions: [{ actionType: "lead", value: 3 }], complete: true })
    ).toMatchObject({ status: "incomplete", value: null });
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [{ actionType: "lead", value: 3 }],
        complete: true,
        absentMeansZero: true,
      })
    ).toMatchObject({ status: "measured", value: 0 });
  });

  it("alias sem regra documentada e validada não se soma", () => {
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [{ actionType: "omni_purchase", value: 7 }],
        complete: true,
      })
    ).toMatchObject({ status: "incomplete", value: null });
  });

  it("alias com regra documentada resolve para o canônico", () => {
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [{ actionType: "omni_purchase", value: 7 }],
        complete: true,
        aliasRules: [{ alias: "omni_purchase", canonical: "purchase", documentedIn: "meta-api-contract-v1" }],
      })
    ).toMatchObject({ status: "measured", value: 7 });
  });

  it("regra de alias sem documento não vale", () => {
    expect(
      measureConversion({
        actionType: "purchase",
        actions: [{ actionType: "omni_purchase", value: 7 }],
        complete: true,
        aliasRules: [{ alias: "omni_purchase", canonical: "purchase", documentedIn: "" }],
      })
    ).toMatchObject({ status: "incomplete", value: null });
  });
});

describe("deriveCpa", () => {
  const measured = { definitionVersion: 2 as const, actionType: "purchase", value: 4, status: "measured" as const };

  it("só retorna razão com status medido, denominador positivo e gasto válido", () => {
    expect(deriveCpa(measured, 100)).toBe(25);
  });

  it("nulo não é zero: sem medida não há CPA", () => {
    expect(deriveCpa({ ...measured, status: "not_defined", value: null }, 100)).toBeNull();
    expect(deriveCpa({ ...measured, status: "incomplete", value: null }, 100)).toBeNull();
    expect(deriveCpa({ ...measured, status: "incompatible", value: null }, 100)).toBeNull();
    expect(deriveCpa(legacyMeasure(), 100)).toBeNull();
    expect(deriveCpa({ ...measured, value: 0 }, 100)).toBeNull();
    expect(deriveCpa(measured, Number.NaN)).toBeNull();
    expect(deriveCpa(measured, -5)).toBeNull();
  });
});

describe("comparabilidade e agregação", () => {
  it("linhas compatíveis agregam o mesmo tipo", () => {
    expect(assertCompatibleLines([context(), context()])).toEqual({ ok: true });
    const total = aggregateMeasures([
      { actionType: "purchase", value: 4, context: context() },
      { actionType: "purchase", value: 6, context: context() },
    ]);
    expect(total).toMatchObject({ status: "measured", value: 10, actionType: "purchase" });
  });

  it.each([
    ["moeda", context({ currency: "USD" })],
    ["período", context({ periodStart: "2026-08-01T00:00:00.000Z" })],
    ["janela", context({ windowDays: 7 })],
    ["versão", context({ definitionVersion: 1 })],
    ["atribuição", context({ attribution: { status: "known", spec: "1d_click" } })],
    ["origem", context({ origin: "mock" })],
    ["completude", context({ completeness: "partial" })],
  ])("divergência de %s impede a agregação", (_label, other) => {
    expect(assertCompatibleLines([context(), other]).ok).toBe(false);
    expect(
      aggregateMeasures([
        { actionType: "purchase", value: 4, context: context() },
        { actionType: "purchase", value: 6, context: other },
      ])
    ).toMatchObject({ status: "incompatible", value: null });
  });

  it("atribuição desconhecida com a mesma condição declarada agrega", () => {
    const unknown = context({ attribution: { status: "unknown", condition: "meta_default_unverified" } });
    expect(assertCompatibleLines([unknown, { ...unknown }])).toEqual({ ok: true });
  });

  it("atribuição desconhecida contra conhecida não agrega", () => {
    const unknown = context({ attribution: { status: "unknown", condition: "meta_default_unverified" } });
    expect(assertCompatibleLines([context(), unknown]).ok).toBe(false);
  });

  it("tipos distintos nunca se somam", () => {
    expect(
      aggregateMeasures([
        { actionType: "purchase", value: 4, context: context() },
        { actionType: "lead", value: 6, context: context() },
      ])
    ).toMatchObject({ status: "incompatible", value: null });
  });

  it("CPA consolidado é gasto compatível sobre conversões do evento, não média de CPAs", () => {
    expect(
      consolidateCpa([
        { actionType: "purchase", value: 1, spend: 100, context: context() },
        { actionType: "purchase", value: 3, spend: 30, context: context() },
      ])
    ).toBe(32.5);
    expect(
      consolidateCpa([
        { actionType: "purchase", value: 1, spend: 100, context: context() },
        { actionType: "purchase", value: 3, spend: 30, context: context({ currency: "USD" }) },
      ])
    ).toBeNull();
  });

  it("snapshot legado sem definição não produz CPA nem compara com v2", () => {
    expect(legacyMeasure()).toEqual({
      definitionVersion: 2,
      actionType: null,
      value: null,
      status: "legacy_unverified",
    });
    expect(assertCompatibleLines([context(), context({ definitionVersion: 1 })]).ok).toBe(false);
  });
});
