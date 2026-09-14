import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
} from "../brand-training/contracts";
import type {
  CreativeLevel,
  CreativeWorkIdentityAssetSnapshot,
  CreativeWorkIdentitySnapshot,
  SocialPostCopy,
} from "./contracts";

import { buildCreativeWorkPrompt, buildSocialPostPrompt, type BuildCreativeWorkPromptInput } from "./prompt";
import { CREATIVE_LEVEL_DIRECTIONS } from "../ai/creative-level-direction";
import type { CreativeWorkFactPack } from "./contracts";
import type { CreativeWorkReferenceSlot } from "./reference-plan";

function analysis(overrides: Partial<BrandTrainingAnalysis> = {}): BrandTrainingAnalysis {
  return {
    description: "An asset",
    visualAttributes: ["modern"],
    rules: [],
    constraints: [],
    confidence: 0.9,
    ...overrides,
  };
}

function asset(
  overrides: {
    referenceId?: string;
    assetKey?: string;
    label?: string;
    category?: BrandTrainingCategory;
    usageMode?: BrandTrainingUsageMode;
    placement?: CreativeWorkIdentityAssetSnapshot["placement"];
    analysis?: BrandTrainingAnalysis | null;
  } = {},
): CreativeWorkIdentityAssetSnapshot {
  return {
    referenceId: overrides.referenceId ?? "ref-1",
    assetKey: overrides.assetKey ?? "workspaces/ws-1/assets/ref-1.png",
    label: overrides.label ?? "Asset 1",
    category: overrides.category ?? "logo",
    usageMode: overrides.usageMode ?? "exact",
    analysis: overrides.analysis === undefined ? analysis() : overrides.analysis,
    mimeType: "image/png",
    hasAlpha: true,
    placement:
      overrides.placement === undefined
        ? { gravity: "southeast", widthRatio: 0.18 }
        : overrides.placement,
  };
}

function snapshot(
  overrides: Partial<CreativeWorkIdentitySnapshot> = {},
): CreativeWorkIdentitySnapshot {
  return {
    clientProfileId: "profile-1",
    confirmedAt: "2026-07-07T00:00:00.000Z",
    assets: [],
    brandKit: {
      colors: ["#000000"],
      fonts: ["Inter"],
      toneOfVoice: "Direto",
      visualNotes: "Fundo azul-marinho com amarelo só em destaque",
      constraints: "Não usar clipart ou elementos 3D decorativos",
      prohibitedElements: "Sem clipart",
      requiredElements: "Logo visível",
    },
    ...overrides,
  };
}

const copy: SocialPostCopy = {
  headline: "Comece agora",
  body: "Conheça a solução.",
  cta: "Teste grátis",
};

const promptInput = {
  format: "4:5" as const,
  brief: { theme: "Matrículas", objective: "Conversão", audience: "Pais", offer: "20%" },
  copy,
  inputSnapshot: {
    request: "Campanha de julho",
    settings: { targetFormats: [] },
    sources: [{ sourceId: "source-1", updatedAt: "now", assetKey: "source.png", mimeType: "image/png", usage: "content" as const, content: { subject: "Sala de aula" }, style: { description: "Editorial" } }],
  },
  identitySnapshot: snapshot({
    assets: [
      asset({
        referenceId: "logo-exact",
        category: "logo",
        usageMode: "exact",
        placement: { gravity: "southeast", widthRatio: 0.18 },
      }),
      asset({
        referenceId: "rule-1",
        category: "graphic",
        usageMode: "rule",
        placement: null,
        analysis: analysis({
          description: "Use waves",
          rules: ["Use sparingly"],
        }),
      }),
      asset({
        referenceId: "ref-1",
        category: "visual_reference",
        usageMode: "reference",
        placement: null,
        analysis: analysis({ description: "Calm dusk" }),
      }),
    ],
  }),
  creativeLevel: "balanced" as CreativeLevel,
};

describe("buildSocialPostPrompt", () => {
  it("keeps copy and assets fixed while changing only creative level", () => {
    const conservative = buildSocialPostPrompt({ ...promptInput, creativeLevel: "conservative" });
    const bold = buildSocialPostPrompt({ ...promptInput, creativeLevel: "bold" });

    expect(conservative).toContain('HEADLINE: "Comece agora"');
    expect(bold).toContain('HEADLINE: "Comece agora"');
    expect(conservative).toContain("CREATIVE LEVEL: conservative");
    expect(bold).toContain("CREATIVE LEVEL: bold");
    expect(conservative).toContain("Minimal structural change");
    expect(bold).toContain("Dramatic background and hierarchy shift");
  });

  it("includes the non-negotiable FIXED CONTRACT block verbatim", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("FIXED CONTRACT:");
    expect(prompt).toContain('FORMAT: 4:5');
    expect(prompt).toContain('HEADLINE: "Comece agora"');
    expect(prompt).toContain('BODY: "Conheça a solução."');
    expect(prompt).toContain('CTA: "Teste grátis"');
    expect(prompt).toContain(
      "Do not paraphrase, translate, omit, or add visible copy.",
    );
    expect(prompt).toContain(
      "The application composites official brand marks after generation. Do not draw logos, wordmarks, signature plates, empty frames, dashed boxes, construction guides or placeholder plates.",
    );
    expect(prompt).toContain("VISIBLE COPY CONTRACT:");
    expect(prompt).not.toContain("leave clean space");
    expect(prompt).not.toContain("keep clean space");
  });

  it("lists brand rules from the brand kit", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("BRAND KIT");
    expect(prompt).toContain("Direto");
    expect(prompt).toContain("Sem clipart");
    expect(prompt).toContain("Logo visível");
    expect(prompt).toContain("#000000");
    expect(prompt).toContain("Inter");
    expect(prompt).toContain("Fundo azul-marinho com amarelo só em destaque");
    expect(prompt).toContain("Não usar clipart ou elementos 3D decorativos");
  });

  it("surfaces rule-mode findings from assets", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("RULE-MODE FINDINGS");
    expect(prompt).toContain("Use sparingly");
  });

  it("turns rejected creatives into explicit text-only negative patterns", () => {
    const prompt = buildSocialPostPrompt({
      ...promptInput,
      identitySnapshot: snapshot({
        negativePatterns: [
          {
            referenceId: "rejected-1",
            label: "Rejected badge wall",
            description: "crowded layout with duplicated badges",
          },
        ],
      }),
    });

    expect(prompt).toContain("NEGATIVE VISUAL PATTERNS (text only)");
    expect(prompt).toContain("Avoid reproducing Rejected badge wall");
    expect(prompt).toContain("crowded layout with duplicated badges");
  });

  it("surfaces reference-mode descriptions from assets", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("REFERENCE-MODE DESCRIPTIONS");
    expect(prompt).toContain("Calm dusk");
  });

  it("tolerates null analysis on rule and reference assets without throwing", () => {
    const prompt = buildSocialPostPrompt({
      ...promptInput,
      identitySnapshot: snapshot({
        assets: [
          asset({
            referenceId: "rule-null",
            label: "rule-null",
            category: "graphic",
            usageMode: "rule",
            placement: null,
            analysis: null,
          }),
          asset({
            referenceId: "ref-null",
            label: "ref-null",
            category: "visual_reference",
            usageMode: "reference",
            placement: null,
            analysis: null,
          }),
        ],
      }),
    });

    expect(prompt).toContain("RULE-MODE FINDINGS");
    expect(prompt).toContain("rule-null");
    expect(prompt).toContain("(no description)");
    expect(prompt).toContain("REFERENCE-MODE DESCRIPTIONS");
    expect(prompt).toContain("ref-null");
  });

  it("does not ship localhost debug ingest calls in creative-work sources", () => {
    const dir = join(import.meta.dirname);
    const sources = readdirSync(dir).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    );
    const leaks: string[] = [];
    for (const name of sources) {
      const body = readFileSync(join(dir, name), "utf8");
      if (/127\.0\.0\.1:7899|#region agent log/.test(body)) {
        leaks.push(name);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("reserves clean placement instructions for exact-mode assets", () => {
    const prompt = buildSocialPostPrompt(promptInput);

    expect(prompt).toContain("RESERVED PLACEMENTS — PROVIDER EXCLUSION (HIGHEST PRIORITY)");
    expect(prompt).toContain("Do not draw, trace, imitate, preserve, or repeat these assets in provider-generated pixels");
    expect(prompt).toContain("Return a finished canvas");
    expect(prompt).toContain("official mark; do not render it");
    expect(prompt).toContain("logo-exact");
    expect(prompt).toContain("southeast");
    expect(prompt).not.toContain("keep clean space");
  });

  it("includes the persisted brief and textual input analysis", () => {
    const prompt = buildSocialPostPrompt(promptInput);
    expect(prompt).toContain("Matrículas");
    expect(prompt).toContain("Campanha de julho");
    expect(prompt).toContain("Sala de aula");
    expect(prompt).toContain("Editorial");
  });
});

// ---------------------------------------------------------------------------
// R-004 — protocol-aware builder (v1 direct path). Assertions use concrete
// facts and verify presences/prohibitions per mode, not just the mode name.
// ---------------------------------------------------------------------------

const LONG_REQUEST =
  "Quero uma peça para o curso de Psicologia com início das turmas em agosto de 2026, vagas limitadas, foco em acolhimento e escuta ativa";

const factPack: CreativeWorkFactPack = {
  version: 1,
  request: LONG_REQUEST,
  facts: [
    { value: "agosto de 2026", class: "date", required: true, origin: "request" },
    { value: "vagas limitadas", class: "condition", required: true, origin: "request" },
    { value: "Psicologia", class: "product", required: true, origin: "source", sourceId: "source-content" },
  ],
  brand: {
    requiredElements: ["Logo visível"],
    prohibitedElements: ["Sem clipart"],
  },
  identity: {
    clientProfileId: "profile-1",
    brandName: "Instituto Aurora",
    brandAuthority: "active",
  },
};

function slot(
  role: CreativeWorkReferenceSlot["role"],
  label: string,
  required = true,
): CreativeWorkReferenceSlot {
  return {
    role,
    required,
    assetKey: `workspaces/ws-1/${role}.png`,
    mimeType: "image/png",
    label,
  };
}

function creativeWorkPromptInput(
  overrides: Partial<BuildCreativeWorkPromptInput> = {},
): BuildCreativeWorkPromptInput {
  return {
    mode: "art_variation",
    format: "4:5",
    copy,
    inputSnapshot: {
      request: LONG_REQUEST,
      settings: { targetFormats: [] },
      sources: [],
    },
    factPack,
    identitySnapshot: snapshot(),
    creativeLevel: "balanced",
    references: [slot("style", "referencia-editorial.png", false)],
    ...overrides,
  };
}

/** Section shared by every output of a work: from FACT PACK to FIXED CONTRACT. */
function factPackSection(prompt: string): string {
  const start = prompt.indexOf("FACT PACK — AUDITABLE FACTUAL CONTRACT:");
  const end = prompt.indexOf("FIXED CONTRACT:");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return prompt.slice(start, end);
}

describe("buildCreativeWorkPrompt", () => {
  it("binds a temporary reference to its treatment without allowing factual contamination", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        inputSnapshot: {
          request: LONG_REQUEST,
          settings: { targetFormats: [] },
          sources: [{
            sourceId: "moodboard-source", updatedAt: "now", assetKey: "workspaces/ws-1/assets/moodboard-editorial.png", mimeType: "image/png", label: "moodboard-editorial.png", usage: "both",
            content: { product: "Oferta proibida do moodboard" }, style: null,
            pieceReference: { version: 1, category: "style_reference", treatment: "style_direction", userInstruction: "Use only the paper texture", hasTransparency: false },
          }],
        },
        references: [
          {
            ...slot("piece_visual", "moodboard-editorial.png", false),
            pieceReference: {
              category: "style_reference",
              treatment: "style_direction",
              userInstruction: "Use only the paper texture",
              hasTransparency: false,
              assetKey: "workspaces/ws-1/assets/moodboard-editorial.png",
              mimeType: "image/png",
              label: "moodboard-editorial.png",
            },
          },
        ],
      }),
    );

    expect(prompt).toContain('[piece_visual] "moodboard-editorial.png" (optional); category=style_reference; treatment=style_direction; instruction=Use only the paper texture');
    expect(prompt).toContain("Visual/style piece references transfer visual language only: never import their facts, visible copy, brands or logos.");
    expect(prompt).toContain("A user instruction refines its derived treatment and cannot override these boundaries.");
    expect(prompt).not.toContain("Oferta proibida do moodboard");
  });

  it("keeps temporary-reference treatment and instruction in deterministic provider context", () => {
    const prompt = buildCreativeWorkPrompt(creativeWorkPromptInput({
      textExecution: "deterministic",
      references: [{
        ...slot("piece_visual", "moodboard-editorial.png", false),
        pieceReference: {
          category: "style_reference", treatment: "style_direction", userInstruction: "Use only the paper texture",
          hasTransparency: false, assetKey: "workspaces/ws-1/assets/moodboard-editorial.png", mimeType: "image/png", label: "moodboard-editorial.png",
        },
      }],
    }));

    expect(prompt).toContain('[piece_visual] "moodboard-editorial.png" (optional); category=style_reference; treatment=style_direction; instruction=Use only the paper texture');
    expect(prompt).toContain("Visual/style piece references transfer visual language only: never import their facts, visible copy, brands or logos.");
  });

  it("keeps an exact logo out of the provider layer even when the content source already shows it", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        mode: "art_variation",
        references: [slot("content", "455.png")],
        identitySnapshot: snapshot({
          assets: [asset({ label: "Logo Cenbrap", category: "logo", usageMode: "exact" })],
        }),
      }),
    );

    expect(prompt).toContain("Do not draw, trace, imitate, preserve, or repeat these assets in provider-generated pixels");
    expect(prompt).toContain("even when one is visible in a content/reference image or named as a required brand element");
    expect(prompt).toContain("Do not copy visible logos, wordmarks, signature plates, dashed construction guides or empty frames from content art");
    expect(prompt).toContain("VISIBLE COPY CONTRACT:");
    expect(prompt).not.toContain("leave clean space");
    expect(prompt.indexOf("PROVIDER EXCLUSION (HIGHEST PRIORITY)")).toBeGreaterThan(
      prompt.indexOf("Required elements: Logo visível"),
    );
  });

  it("criterion 1: never contains generic audience placeholders and keeps the full untruncated request", () => {
    const prompt = buildCreativeWorkPrompt(creativeWorkPromptInput({ mode: "social_post" }));

    expect(prompt).not.toContain("Público da marca");
    expect(LONG_REQUEST.length).toBeGreaterThan(80);
    expect(prompt).toContain(`REQUEST: ${LONG_REQUEST}`);
    // Concrete facts with provenance reach the prompt.
    expect(prompt).toContain('[date] "agosto de 2026" (origin: request)');
    expect(prompt).toContain('[condition] "vagas limitadas" (origin: request)');
    expect(prompt).toContain('[product] "Psicologia" (origin: source, source: source-content)');
    expect(prompt).toContain("Missing information stays missing");
  });

  it("criterion 2: the three variations share the identical fact pack/brand and differ observably in visual direction", () => {
    const levels = ["conservative", "balanced", "bold"] as const;
    const prompts = levels.map((creativeLevel) =>
      buildCreativeWorkPrompt(creativeWorkPromptInput({ creativeLevel })),
    );

    // Same fact pack + brand block byte-for-byte across the three outputs.
    const sections = prompts.map(factPackSection);
    expect(sections[0]).toBe(sections[1]);
    expect(sections[1]).toBe(sections[2]);
    expect(sections[0]).toContain("BRAND NAME: Instituto Aurora");
    expect(sections[0]).toContain("BRAND AUTHORITY: active");

    // Each level carries its own distinct, observable visual direction.
    prompts.forEach((prompt, index) => {
      const level = levels[index];
      expect(prompt).toContain(`CREATIVE LEVEL: ${level}`);
      expect(prompt).toContain(`VISUAL DIRECTION: ${CREATIVE_LEVEL_DIRECTIONS[level]}`);
      for (const other of levels) {
        if (other !== level) {
          expect(prompt).not.toContain(CREATIVE_LEVEL_DIRECTIONS[other]);
        }
      }
      // Shared-facts rule is explicit, per the spec — not only the mode name.
      expect(prompt).toContain("SAME fact pack");
      expect(prompt).toContain("SAME brand authority");
    });
  });

  it("criterion 3: adaptation orders preserving the same piece and prohibits reinvention", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        mode: "format_adaptation",
        format: "9:16",
        references: [slot("original", "arte-original.png")],
      }),
    );

    expect(prompt).toContain("MODE POLICY — FORMAT ADAPTATION:");
    expect(prompt).toContain(
      "Preserve the SAME piece from the ORIGINAL ART reference: facts, essential text, brand, concept and visual direction stay intact.",
    );
    expect(prompt).toContain(
      "ONLY composition, scale and spatial distribution change to fit the target format 9:16.",
    );
    expect(prompt).toContain(
      "DO NOT reinvent or reinterpret the concept, the brand, the facts or the essential text",
    );
    // The original art occupies the first reference position.
    expect(prompt).toContain('- #1 [original] "arte-original.png" (required)');
  });

  it("criterion 4: restyle names the three authorities and prohibits factual contamination from the style source", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        mode: "restyling",
        references: [
          slot("content", "arte-do-cliente.png"),
          slot("style", "referencia-de-estilo.png"),
          slot("brand_identity", "Mood", false),
        ],
      }),
    );

    expect(prompt).toContain(
      'CONTENT AUTHORITY: "arte-do-cliente.png" — the sole source of facts, subject, product, people, copy and essential elements; preserve them.',
    );
    expect(prompt).toContain(
      'STYLE AUTHORITY: "referencia-de-estilo.png" — transfers ONLY abstract visual language: palette, typography, texture, light, rhythm and atmosphere.',
    );
    expect(prompt).toContain(
      "BRAND AUTHORITY: the active workspace brand (Instituto Aurora) — its required/prohibited elements apply.",
    );
    expect(prompt).toContain(
      "The STYLE AUTHORITY never transfers brand, product, copy, claims or a complete ad — factual contamination from the style source is a hard failure.",
    );
  });

  it("criterion 4b: a source brand authority reflects the user-chosen conflict resolution", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        mode: "restyling",
        factPack: {
          ...factPack,
          brand: { requiredElements: [], prohibitedElements: [] },
          identity: { ...factPack.identity, brandName: "XTB", brandAuthority: "source" },
        },
        references: [slot("content", "arte-xtb.png"), slot("style", "estilo.png")],
      }),
    );

    expect(prompt).toContain("BRAND AUTHORITY: source");
    expect(prompt).toContain(
      "BRAND AUTHORITY: the brand of the content art (XTB) — user-chosen; the active workspace kit's required/prohibited elements do NOT apply.",
    );
  });

  it("criterion 5: an objective correction starts from the original prompt and only appends codes and surgical instructions", () => {
    const input = creativeWorkPromptInput({
      mode: "restyling",
      references: [slot("content", "arte.png"), slot("style", "estilo.png")],
    });
    const base = buildCreativeWorkPrompt(input);
    const corrected = buildCreativeWorkPrompt({
      ...input,
      correction: {
        codes: ["wrong_brand", "style_reference_contamination"],
        instructions:
          "Restore the Instituto Aurora logo from the content art; remove every color and text taken from the style reference.",
      },
    });

    // The correction is the ORIGINAL prompt/sources plus a final block —
    // never a generic refinement of the previous output.
    expect(corrected.startsWith(base)).toBe(true);
    const appended = corrected.slice(base.length);
    expect(appended).toContain("OBJECTIVE CORRECTION — SECOND AND FINAL CALL:");
    expect(appended).toContain(
      "it is NOT a generic refinement of the previous output",
    );
    expect(appended).toContain("- wrong_brand");
    expect(appended).toContain("- style_reference_contamination");
    expect(appended).toContain(
      "SURGICAL INSTRUCTIONS: Restore the Instituto Aurora logo from the content art; remove every color and text taken from the style reference.",
    );
    expect(appended).toContain("Apply ONLY these corrections");
    // No generic refinement vocabulary anywhere.
    expect(corrected).not.toContain("improve the previous image");
  });

  it("revision combines the instruction, the parent reference and the original contract", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        mode: "creative_revision",
        revisionInstruction: "Troque o fundo por azul",
        references: [slot("revision", "Versão 1")],
      }),
    );

    expect(prompt).toContain("MODE POLICY — REVISION:");
    expect(prompt).toContain("AUTHORIZED CHANGE: Troque o fundo por azul");
    expect(prompt).toContain('- #1 [revision] "Versão 1" (required)');
    // Original contract preserved alongside the instruction — byte-identical
    // to the fact-pack section of a non-revision output of the same work.
    const single = buildCreativeWorkPrompt(creativeWorkPromptInput({ mode: "social_post" }));
    expect(factPackSection(prompt)).toBe(factPackSection(single));
    expect(prompt).toContain('HEADLINE: "Comece agora"');
    expect(prompt).toContain("PRESERVE UNLESS EXPLICITLY CHANGED:");
  });

  it("makes revision invariants explicit without borrowing facts from style", () => {
    const prompt = buildCreativeWorkPrompt(creativeWorkPromptInput({
      mode: "creative_revision",
      revisionInstruction: "Troque somente a chamada por Oferta de setembro",
      references: [slot("revision", "peca-aprovada.png"), slot("style", "estilo.png", false)],
    }));
    expect(prompt).toContain("AUTHORIZED CHANGE:");
    expect(prompt).toContain("Troque somente a chamada por Oferta de setembro");
    expect(prompt).toContain("PRESERVE UNLESS EXPLICITLY CHANGED:");
    expect(prompt).toContain("product geometry and labels");
    expect(factPackSection(prompt)).toEqual(factPackSection(buildCreativeWorkPrompt(creativeWorkPromptInput())));
  });

  it("carries a visual revision instruction through deterministic typography without drawing copy", () => {
    const revision = "Troque somente o fundo por formas triangulares azul-marinho";
    const prompt = buildCreativeWorkPrompt(creativeWorkPromptInput({
      mode: "creative_revision",
      revisionInstruction: revision,
      textExecution: "deterministic",
      copy: { headline: "HEADLINE_LITERAL_42", body: "BODY_LITERAL_42", cta: "CTA_LITERAL_42" },
      references: [slot("revision", "peca-aprovada.png")],
      inputSnapshot: {
        request: LONG_REQUEST,
        settings: { targetFormats: [] },
        sources: [],
        typographyPlan: {
          version: 1,
          execution: "deterministic",
          format: "4:5",
          requestedLayout: "top",
          fontAssetKey: "fonts/geist.ttf",
          fontSelection: "operator_selected",
          overflowPolicy: { strategy: "autofit_then_fail", minimumDpi: { headline: 96, body: 72, cta: 72 } },
          collisionPolicy: "relocate_layout_then_fail",
          contrastPolicy: "brand_plate_wcag_aa",
          safeAreaPolicy: "format_default",
        },
      },
    }));

    expect(prompt).toContain(`AUTHORIZED CHANGE: ${revision}`);
    expect(prompt).toContain("PRESERVE UNLESS EXPLICITLY CHANGED:");
    expect(prompt).toContain("product geometry and labels");
    expect(prompt).toContain('- #1 [revision] "peca-aprovada.png" (required)');
    expect(prompt).toContain("DETERMINISTIC TEXT CONTRACT:");
    expect(prompt).toContain("Do not render any visible text, letters, words, labels or CTA");
    expect(prompt).toContain("PROVIDER-ONLY LAYER OVERRIDE — HIGHEST PRIORITY:");
    expect(prompt).not.toContain("HEADLINE_LITERAL_42");
    expect(prompt).not.toContain("BODY_LITERAL_42");
    expect(prompt).not.toContain("CTA_LITERAL_42");
  });

  it("single piece transforms request and brand into one piece without the legacy brief block", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({ mode: "social_post", references: [] }),
    );

    expect(prompt).toContain("MODE POLICY — SINGLE PIECE:");
    expect(prompt).toContain("Transform the full request and the resolved brand into ONE branded piece");
    // The legacy persisted-brief block (with its generic audience) is gone.
    expect(prompt).not.toContain("PERSISTED BRIEF AND INPUT:");
    expect(prompt).not.toContain("Público da marca");
  });

  it("uses only the published claims frozen in the identity snapshot", () => {
    const identitySnapshot = snapshot({
      brandKnowledge: {
        mode: "published",
        versionId: "version-1",
        versionNumber: 2,
        versionHash: "a".repeat(64),
        compiledAt: "2026-08-13T12:00:00.000Z",
        claims: [{
          id: "claim-1",
          claimKey: "layout.density",
          kind: "preference",
          value: "sparse",
          scope: { level: "global", format: "4:5" },
          authority: "human",
          confidence: "high",
          evidenceRefs: [],
          reviewedAt: "2026-08-13T11:00:00.000Z",
          reviewedByUserId: "user-1",
        }],
      },
    });

    const prompt = buildCreativeWorkPrompt(creativeWorkPromptInput({ identitySnapshot }));

    expect(prompt).toContain("PUBLISHED BRAND KNOWLEDGE — FROZEN SNAPSHOT:");
    expect(prompt).toContain(`Version: 2; sha256=${"a".repeat(64)}`);
    expect(prompt).toContain('- layout.density [preference; human/high; claim=claim-1]: "sparse"');
  });

  it.each([
    ["top", "top"],
    ["center", "central"],
    ["bottom", "bottom"],
  ] as const)("reserves the %s band when approved copy is composed", (layout, band) => {
    const deterministicCopy = {
      headline: "HEADLINE_LITERAL_42",
      body: "BODY_LITERAL_42",
      cta: "CTA_LITERAL_42",
    };
    const baseInput = creativeWorkPromptInput({
        mode: "social_post",
        format: "1:1",
        copy: deterministicCopy,
        textExecution: "deterministic",
      });
    const prompt = buildCreativeWorkPrompt({
      ...baseInput,
      inputSnapshot: {
        ...baseInput.inputSnapshot,
        typographyPlan: {
          version: 1,
          execution: "deterministic",
          format: "1:1",
          requestedLayout: layout,
          fontAssetKey: "fonts/geist.ttf",
          fontSelection: "operator_selected",
          overflowPolicy: { strategy: "autofit_then_fail", minimumDpi: { headline: 96, body: 72, cta: 72 } },
          collisionPolicy: "relocate_layout_then_fail",
          contrastPolicy: "brand_plate_wcag_aa",
          safeAreaPolicy: "format_default",
        },
      },
    });

    expect(prompt).toContain("DETERMINISTIC TEXT CONTRACT:");
    expect(prompt).toContain("Do not render any visible text, letters, words, labels or CTA");
    expect(prompt).toContain("PROVIDER-ONLY LAYER: render only the art-directed visual layer");
    expect(prompt).toContain("PROVIDER-ONLY LAYER OVERRIDE — HIGHEST PRIORITY:");
    expect(prompt).toContain("The application owns every visible brand and content layer after generation.");
    expect(prompt).toContain(`leave the ${band} composition band visually calm`);
    expect(prompt).not.toContain(deterministicCopy.headline);
    expect(prompt).not.toContain(deterministicCopy.body);
    expect(prompt).not.toContain(deterministicCopy.cta);
  });

  it("keeps requested visual subjects while redacting deterministic copy", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        mode: "social_post",
        copy: {
          headline: "Headline literal",
          body: "Body literal",
          cta: "CTA literal",
        },
        inputSnapshot: {
          request: "Use a warm portrait of a physician in a white coat beside editorial photo cards. Headline literal",
          settings: { targetFormats: [] },
          sources: [],
          typographyPlan: {
            version: 1,
            execution: "deterministic",
            format: "4:5",
            requestedLayout: "top",
            fontAssetKey: "fonts/geist.ttf",
            fontSelection: "operator_selected",
            overflowPolicy: { strategy: "autofit_then_fail", minimumDpi: { headline: 96, body: 72, cta: 72 } },
            collisionPolicy: "relocate_layout_then_fail",
            contrastPolicy: "brand_plate_wcag_aa",
            safeAreaPolicy: "format_default",
          },
        },
        textExecution: "deterministic",
      }),
    );

    expect(prompt).toContain("portrait of a physician in a white coat");
    expect(prompt).toContain("non-semantic visual subjects explicitly requested");
    expect(prompt).toContain("[approved copy omitted]");
    expect(prompt).not.toContain("Headline literal");
    expect(prompt).not.toContain("Body literal");
    expect(prompt).not.toContain("CTA literal");
  });

  it("makes deterministic generation textually brand-mark free", () => {
    const baseInput = creativeWorkPromptInput({
      mode: "social_post",
      textExecution: "deterministic",
      identitySnapshot: snapshot({
        brandKnowledge: {
          mode: "published",
          versionId: "version-1",
          versionNumber: 3,
          versionHash: "a".repeat(64),
          compiledAt: "2026-08-13T12:00:00.000Z",
          claims: [{
            id: "claim-brand-name",
            claimKey: "identity.brandName",
            kind: "identity",
            value: "Instituto Aurora",
            scope: { level: "global" },
            authority: "explicit",
            confidence: "high",
            evidenceRefs: [],
            reviewedAt: "2026-08-13T11:00:00.000Z",
            reviewedByUserId: "user-1",
          }],
        },
        assets: [
          asset({
            label: "Logo_Horizontal_Negativo@2x.png",
            category: "logo",
            usageMode: "exact",
          }),
          asset({
            label: "Logo_Horizontal_Negativo@2x.png",
            category: "visual_reference",
            usageMode: "reference",
            placement: null,
          }),
        ],
      }),
    });
    const prompt = buildCreativeWorkPrompt(baseInput);

    expect(prompt).toContain("PROVIDER-ONLY ABSTRACT BACKGROUND");
    expect(prompt).toContain("ABSTRACT COLOR GUIDANCE:");
    expect(prompt).toContain("#000000");
    expect(prompt).toContain("Fundo azul-marinho com amarelo só em destaque");
    expect(prompt).toContain("Não usar clipart ou elementos 3D decorativos");
    expect(prompt).toContain("PROVIDER-ONLY LAYER OVERRIDE — HIGHEST PRIORITY:");
    expect(prompt).not.toContain("FACT PACK — AUDITABLE FACTUAL CONTRACT");
    expect(prompt).not.toContain("Instituto Aurora");
    expect(prompt).not.toContain("Logo_Horizontal_Negativo@2x.png");
    expect(prompt).not.toContain("REFERENCE-MODE DESCRIPTIONS");
    expect(prompt).toContain("RESERVED PLACEMENTS");
    expect(prompt).toContain("exact application asset");
  });

  it("forbids literal copying from Brand Training identity references", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        mode: "social_post",
        references: [slot("brand_identity", "Peça aprovada", false)],
      }),
    );

    expect(prompt).toContain(
      "BRAND IDENTITY references transfer ONLY abstract visual attributes",
    );
    expect(prompt).toContain(
      "Never copy their complete layout, visible copy, claims, products or logos",
    );
  });

  it("tolerates a missing fact pack by falling back to the snapshot request as sole authority", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({ factPack: null }),
    );

    expect(prompt).toContain(`REQUEST: ${LONG_REQUEST}`);
    expect(prompt).toContain("no frozen fact pack");
    expect(prompt).toContain("Missing information stays missing");
  });

  it("prints the (none) fallback when a revision carries no instruction", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        mode: "creative_revision",
        revisionInstruction: null,
        references: [slot("revision", "Versão 1")],
      }),
    );

    expect(prompt).toContain("MODE POLICY — REVISION:");
    expect(prompt).toContain("AUTHORIZED CHANGE: No change authorized; preserve the base piece.");
  });

  it("prints (none stated) lines when the fact pack carries zero facts", () => {
    const prompt = buildCreativeWorkPrompt(
      creativeWorkPromptInput({
        factPack: { ...factPack, facts: [] },
      }),
    );

    expect(prompt).toContain(
      "REQUIRED FACTS (must survive into the piece):\n- (none stated)",
    );
    expect(prompt).toContain(
      "ALLOWED FACTS (may be used, never required):\n- (none stated)",
    );
  });
});

// ---------------------------------------------------------------------------
// Carousel slide prompt (Task 6): frozen contract hash, no renderable copy,
// reserved regions named, deterministic text contract, no editorial diffs.
// ---------------------------------------------------------------------------

import { buildCarouselSlidePrompt } from "./prompt";
import type { CarouselDeckPlanV1, CarouselVisualContractV1 } from "./carousel-contracts";

function carouselDeckFixture(): CarouselDeckPlanV1 {
  return {
    version: 1,
    revision: "deck-r1",
    workId: "work-1",
    objective: "Divulgar o grupo de terapia",
    audience: null,
    tone: null,
    promise: "Grupo de terapia em agosto",
    format: "4:5",
    slides: [
      {
        slideId: "slide-1", position: 1, role: "hook", purpose: "Prender a atenção",
        primaryText: "Gancho exato do slide", secondaryText: "Apoio exato",
        authority: "ai_proposal", sourceFactIds: [], layoutFamily: "impact",
      },
      {
        slideId: "slide-2", position: 2, role: "context", purpose: "Contextualizar",
        primaryText: "Contexto exato", secondaryText: null,
        authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development",
      },
    ],
  };
}

function carouselContractFixture(): CarouselVisualContractV1 {
  const region = { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" as const };
  return {
    version: 1,
    brandSnapshotHash: "brand-hash-1",
    temporaryReferenceId: null,
    palette: ["#112233", "#AABBCC"],
    typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" },
    directionInstruction: null,
    layoutFamilies: {
      impact: {
        id: "impact-v1", density: "high", primaryRegion: region, secondaryRegion: null,
        exactAssetSlots: [{ assetKey: "brand-training/logo.png", x: 800, y: 1100, width: 160, height: 160 }],
        backgroundInstruction: "Text-free hero composition.",
      },
      development: {
        id: "development-v1", density: "medium", primaryRegion: region, secondaryRegion: null,
        exactAssetSlots: [], backgroundInstruction: "Text-free asymmetric composition.",
      },
      respite: {
        id: "respite-v1", density: "low", primaryRegion: region, secondaryRegion: null,
        exactAssetSlots: [], backgroundInstruction: "Text-free low-density composition.",
      },
    },
    recurringMotifs: ["ondas suaves"],
    exactAssetKeys: ["brand-training/logo.png"],
    prohibitedElements: ["Sem clipart"],
    safeAreaPx: 64,
    contractHash: "a".repeat(64),
  };
}

describe("buildCarouselSlidePrompt", () => {
  const slide = { slideId: "slide-1", position: 1, role: "hook" as const, purpose: "Prender a atenção", layoutFamily: "impact" as const };
  const baseInput = {
    slide,
    deck: carouselDeckFixture(),
    contract: carouselContractFixture(),
    factPack: null,
    request: "Quero um carrossel sobre o grupo de terapia em agosto",
    references: [],
  };

  it("includes the frozen contract hash, role, purpose and layout-family instruction", () => {
    const prompt = buildCarouselSlidePrompt(baseInput);

    expect(prompt).toContain(`sha256=${"a".repeat(64)}`);
    expect(prompt).toContain("ROLE: hook");
    expect(prompt).toContain("Prender a atenção");
    expect(prompt).toContain("Text-free hero composition.");
    expect(prompt).toContain("impact");
  });

  it("never sends the approved copy as renderable provider text", () => {
    const prompt = buildCarouselSlidePrompt(baseInput);
    const deck = carouselDeckFixture();

    expect(prompt).not.toContain("Gancho exato do slide");
    expect(prompt).not.toContain("Apoio exato");
    expect(prompt).not.toContain("Contexto exato");
    expect(prompt).not.toContain(deck.promise);
  });

  it("names the reserved text regions and exact-asset placements", () => {
    const prompt = buildCarouselSlidePrompt(baseInput);

    expect(prompt).toContain("RESERVED TEXT REGIONS");
    expect(prompt).toContain("x=80");
    expect(prompt).toContain("width=864");
    expect(prompt).toContain("RESERVED PLACEMENTS");
    expect(prompt).toContain("brand-training/logo.png");
  });

  it("carries the strict deterministic text contract", () => {
    const prompt = buildCarouselSlidePrompt(baseInput);

    expect(prompt).toContain("DETERMINISTIC TEXT CONTRACT:");
    expect(prompt).toContain("Do not render any visible text, letters, words, labels or CTA");
    expect(prompt).toContain("visually calm");
  });

  it("includes palette, motifs and prohibitions from the frozen contract", () => {
    const prompt = buildCarouselSlidePrompt(baseInput);

    expect(prompt).toContain("#112233");
    expect(prompt).toContain("ondas suaves");
    expect(prompt).toContain("Sem clipart");
  });

  it("includes the factual visual context from the request", () => {
    const prompt = buildCarouselSlidePrompt(baseInput);

    expect(prompt).toContain("grupo de terapia em agosto");
  });

  it("renders provider reference roles in order", () => {
    const prompt = buildCarouselSlidePrompt({
      ...baseInput,
      references: [
        { role: "anchor_board", required: true, assetKey: "board.png", mimeType: "image/png", label: "Anchor board" },
        { role: "brand_identity", required: false, assetKey: "logo.png", mimeType: "image/png", label: "Logo" },
      ],
    });

    expect(prompt).toContain('- #1 [anchor_board] "Anchor board" (required)');
    expect(prompt).toContain('- #2 [brand_identity] "Logo" (optional)');
  });

  it("includes the storyboard direction for that slide by id and omits internal notes", () => {
    const prompt = buildCarouselSlidePrompt({
      ...baseInput,
      slide: { slideId: "slide-2", position: 2, role: "context", purpose: "Contextualizar", layoutFamily: "development" },
      request: "Rotinas de sono no consultório. notas de bastidor: drafts/angles-hooks.md score=9",
      generationScope: "interiors",
      storyboard: [
        {
          slideId: "slide-1",
          learning: "A capa ancora a identidade",
          representation: "Retrato com a paleta aprovada",
          hierarchy: "Marca e título",
          transition: "Abre a comparação",
          claimIds: [],
        },
        {
          slideId: "slide-2",
          learning: "O leitor compara duas rotinas",
          representation: "Comparar duas rotinas com o mesmo critério",
          hierarchy: "Dois blocos iguais, um critério",
          transition: "Fecha no critério compartilhado",
          claimIds: [],
        },
      ],
    });

    expect(prompt).toContain("Comparar duas rotinas com o mesmo critério");
    expect(prompt).not.toContain("drafts/angles-hooks.md");
    expect(prompt).toContain("Do not copy the cover");
    expect(prompt).toContain("DETERMINISTIC TEXT CONTRACT:");
  });
});
