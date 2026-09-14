import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

import { VisualRepertoireReview } from "./VisualRepertoireReview";
import type { VisualRepertoire, VisualRule } from "@/server/brand-training/visual-repertoire";

const RULE_ID = "11111111-1111-4111-8111-111111111111";
const LANG_ID = "22222222-2222-4222-8222-222222222222";

function rule(overrides: Partial<VisualRule> = {}): VisualRule {
  return {
    id: RULE_ID,
    dimension: "hierarchy",
    observation: "Título domina a leitura",
    application: "Dar ao título escala superior ao texto de apoio",
    avoid: "Competição de dois focos",
    evidenceIds: ["ref-1"],
    confidence: "high",
    ...overrides,
  };
}

const repertoire: VisualRepertoire = {
  version: 1,
  common: [rule()],
  languages: [{
    id: LANG_ID,
    name: "Comercial",
    contexts: ["oferta"],
    rules: [rule({ id: "33333333-3333-4333-8333-333333333333", evidenceIds: ["ref-2"] })],
  }],
};

describe("VisualRepertoireReview", () => {
  it("renders common identity, named languages and evidence thumbnails", () => {
    render(
      <VisualRepertoireReview
        value={repertoire}
        onChange={() => {}}
        previewById={{ "ref-1": "https://img/ref-1.jpg", "ref-2": "https://img/ref-2.jpg" }}
      />,
    );
    expect(screen.getByTestId("visual-repertoire-review")).toBeDefined();
    expect(screen.getByText("brandTraining.repertoire.commonTitle")).toBeDefined();
    expect(screen.getByLabelText("brandTraining.repertoire.name")).toHaveProperty("value", "Comercial");
    expect(screen.getByLabelText("brandTraining.repertoire.contexts")).toHaveProperty("value", "oferta");
    const images = screen.getAllByAltText("brandTraining.repertoire.evidenceAlt");
    expect(images).toHaveLength(2);
    expect(images[0]?.getAttribute("src")).toBe("https://img/ref-1.jpg");
  });

  it("shows an unavailable placeholder instead of a broken image", () => {
    render(<VisualRepertoireReview value={repertoire} onChange={() => {}} previewById={{}} />);
    expect(screen.queryByAltText("brandTraining.repertoire.evidenceAlt")).toBeNull();
    expect(screen.getAllByText("brandTraining.repertoire.evidenceUnavailable")).toHaveLength(2);
  });

  it("emits context and application edits through onChange", () => {
    const onChange = vi.fn();
    render(<VisualRepertoireReview value={repertoire} onChange={onChange} previewById={{}} />);
    fireEvent.change(screen.getByLabelText("brandTraining.repertoire.contexts"), {
      target: { value: "oferta, varejo" },
    });
    expect(onChange).toHaveBeenCalledWith({
      ...repertoire,
      languages: [{ ...repertoire.languages[0]!, contexts: ["oferta", "varejo"] }],
    });
    const commonSection = screen.getByTestId(`repertoire-rule-${RULE_ID}`);
    const application = within(commonSection).getByLabelText("brandTraining.repertoire.application");
    fireEvent.change(application, { target: { value: "Priorizar o título sempre" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...repertoire,
      common: [{ ...repertoire.common[0]!, application: "Priorizar o título sempre" }],
      languages: repertoire.languages,
    });
  });

  it("moves a rule between the common identity and a language", () => {
    const onChange = vi.fn();
    render(<VisualRepertoireReview value={repertoire} onChange={onChange} previewById={{}} />);
    const commonRuleItem = screen.getByTestId(`repertoire-rule-${RULE_ID}`);
    fireEvent.change(within(commonRuleItem).getByLabelText("brandTraining.repertoire.moveTo"), {
      target: { value: LANG_ID },
    });
    const [next] = onChange.mock.calls[0] as [VisualRepertoire];
    expect(next.common).toHaveLength(0);
    expect(next.languages[0]?.rules.map((entry) => entry.id)).toContain(RULE_ID);
  });

  it("adds a language draft without inventing rules", () => {
    const onChange = vi.fn();
    render(<VisualRepertoireReview value={repertoire} onChange={onChange} previewById={{}} />);
    fireEvent.change(screen.getByLabelText("brandTraining.repertoire.newLanguageName"), {
      target: { value: "Institucional" },
    });
    fireEvent.click(screen.getByText("brandTraining.repertoire.addLanguage"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [VisualRepertoire];
    expect(next.languages).toHaveLength(2);
    expect(next.languages[1]).toMatchObject({ name: "Institucional", contexts: [], rules: [] });
  });
});
