import { describe, expect, it } from "vitest";
import {
  copySafeBrandElements,
  isLegalDisclaimerText,
  isVisualBrandInstruction,
  partitionBrandKitForCopy,
} from "./brand-field-routing";

const PRECEPTORIA_REQUIRED =
  "Para a peça visual, inclua o logo oficial PreceptorIA/CENBRAP; mantenha fundo predominantemente azul-marinho (#071522) com amarelo (#FFC914) apenas nos destaques; Apoio à decisão: não substitui avaliação e julgamento médico. Não inclua dados identificáveis de pacientes.";

const PRECEPTORIA_PROHIBITED =
  "Não alterar as proporções, cores ou tipografia do logo; Sem clipart; Sem promessas de cura";

describe("isVisualBrandInstruction", () => {
  it("flags logo, hex, and layout instructions", () => {
    expect(isVisualBrandInstruction("inclua o logo oficial PreceptorIA")).toBe(true);
    expect(isVisualBrandInstruction("fundo azul-marinho (#071522)")).toBe(true);
    expect(isVisualBrandInstruction("Não alterar proporções do logo")).toBe(true);
  });

  it("does not flag clinical disclaimer or claim bans", () => {
    expect(
      isVisualBrandInstruction(
        "Apoio à decisão: não substitui avaliação e julgamento médico.",
      ),
    ).toBe(false);
    expect(isVisualBrandInstruction("Sem promessas de cura")).toBe(false);
  });
});

describe("isLegalDisclaimerText", () => {
  it("recognises the PreceptorIA clinical notice", () => {
    expect(
      isLegalDisclaimerText(
        "Apoio à decisão: não substitui avaliação e julgamento médico. Não inclua dados identificáveis de pacientes.",
      ),
    ).toBe(true);
  });
});

describe("partitionBrandKitForCopy — PreceptorIA fixture", () => {
  it("keeps tone + legal disclaimer and drops visual rules", () => {
    const voice = partitionBrandKitForCopy({
      toneOfVoice: "Técnico e acolhedor",
      toneNotes: "Evite jargão vazio",
      requiredElements: PRECEPTORIA_REQUIRED,
      prohibitedElements: PRECEPTORIA_PROHIBITED,
    });

    expect(voice.toneOfVoice).toContain("Técnico e acolhedor");
    expect(voice.toneOfVoice).toContain("Evite jargão vazio");
    expect(voice.legalDisclaimers).toHaveLength(1);
    expect(voice.legalDisclaimers[0]).toMatch(/não substitui avaliação e julgamento médico/i);
    expect(voice.prohibitedClaims).toContain("Sem promessas de cura");
    expect(voice.prohibitedClaims.join(" ")).not.toMatch(/logo|tipografia|propor/i);

    const blob = JSON.stringify(voice);
    expect(blob).not.toMatch(/#071522|#FFC914/i);
    expect(blob).not.toMatch(/logo oficial/i);
    expect(blob).not.toMatch(/fundo predominantemente/i);
  });
});

describe("copySafeBrandElements", () => {
  it("exposes only legal required text for fact-pack copy grounding", () => {
    const elements = copySafeBrandElements({
      requiredElements: PRECEPTORIA_REQUIRED,
      prohibitedElements: PRECEPTORIA_PROHIBITED,
    });
    expect(elements.requiredElements).toHaveLength(1);
    expect(elements.requiredElements[0]).toMatch(/Apoio à decisão/i);
    expect(elements.prohibitedElements).toEqual(
      expect.arrayContaining(["Sem promessas de cura"]),
    );
    expect(elements.prohibitedElements.join(" ")).not.toMatch(/logo|tipografia/i);
  });
});
