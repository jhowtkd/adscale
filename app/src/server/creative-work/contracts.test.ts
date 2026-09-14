import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CREATIVE_FACT_CLASSES,
  CREATIVE_FACT_ORIGINS,
  CREATIVE_SOURCE_STATUSES,
  CREATIVE_SOURCE_USAGES,
  CREATIVE_WORK_GENERATION_POLICY_VERSIONS,
  CREATIVE_WORK_INTENTS,
  artRefinementCreditCeiling,
  createCreativeWorkSchema,
  creativeDirectionPoolSchema,
  creativeWorkPersonSnapshotSchema,
  creativeWorkSettingsSchema,
  creativeWorkVisualDirectionSchema,
  displayRequestForCreativeWork,
  generationPolicyVersionFromSwitch,
  inferredBriefingSchema,
  quoteCreativeWork,
  requestTextFromBrief,
  resolveCreativeWorkArtRefinement,
  resolveCreativeWorkFactPack,
  resolveCreativeWorkInferredBriefing,
  resolveCreativeWorkStatus,
  resolveGenerationPolicyVersion,
  socialPostBriefSchema,
  type CreativeWorkInputSnapshot,
  type CreativeWorkSettings,
} from "./contracts";
import type { CarouselDraftStateV1 } from "./carousel-contracts";

describe("creative work contracts", () => {
  it("builds a human-readable request from brief fields instead of JSON", () => {
    expect(
      requestTextFromBrief({
        theme: "Promoção de matrícula",
        objective: "Gerar leads",
        offer: "julho",
      }),
    ).toBe("Promoção de matrícula — julho");
    expect(
      displayRequestForCreativeWork({
        request: JSON.stringify({
          theme: "Promoção de matrícula",
          objective: "Gerar leads",
          audience: "Pais",
          offer: "julho",
        }),
        brief: null,
      }),
    ).toBe("Promoção de matrícula — julho");
  });

  it("accepts a social post brief with one supported format", () => {
    expect(
      createCreativeWorkSchema.parse({
        clientProfileId: "00000000-0000-4000-8000-000000000001",
        toolKind: "social_post",
        format: "4:5",
        brief: {
          theme: "Novo produto",
          objective: "Gerar interesse",
          audience: "Empreendedores digitais",
          offer: "Teste gratuito",
        },
      }).format,
    ).toBe("4:5");
  });

  it("defaults toolKind to social_post when omitted", () => {
    const parsed = createCreativeWorkSchema.parse({
      clientProfileId: "00000000-0000-4000-8000-000000000001",
      format: "1:1",
      brief: {
        theme: "Tema",
        objective: "Obj",
        audience: "Aud",
        offer: "Oferta",
      },
    });
    expect(parsed.toolKind).toBe("social_post");
  });

  it("resolves partial when at least one output failed and one completed", () => {
    expect(resolveCreativeWorkStatus(["completed", "failed", "completed"])).toBe("partial");
  });

  it("publishes the generation policy versions with legacy first", () => {
    expect(CREATIVE_WORK_GENERATION_POLICY_VERSIONS).toEqual(["legacy", "quality_recovery_v1"]);
  });

  it("round-trips generationPolicyVersion through the input snapshot", () => {
    const snapshot: CreativeWorkInputSnapshot = {
      generationPolicyVersion: "quality_recovery_v1",
      request: "Promoção",
      settings: { targetFormats: [] },
      sources: [],
    };
    const restored = JSON.parse(JSON.stringify(snapshot)) as CreativeWorkInputSnapshot;
    expect(restored.generationPolicyVersion).toBe("quality_recovery_v1");
    expect(resolveGenerationPolicyVersion(restored)).toBe("quality_recovery_v1");
  });

  it("resolves snapshots without generationPolicyVersion as legacy", () => {
    const legacySnapshot = {
      request: "Promoção",
      settings: { targetFormats: [] },
      sources: [],
    } as CreativeWorkInputSnapshot;
    expect(resolveGenerationPolicyVersion(legacySnapshot)).toBe("legacy");
    expect(resolveGenerationPolicyVersion(null)).toBe("legacy");
    expect(resolveGenerationPolicyVersion(undefined)).toBe("legacy");
    expect(
      resolveGenerationPolicyVersion({
        ...legacySnapshot,
        generationPolicyVersion: "unknown_future_version" as never,
      }),
    ).toBe("legacy");
  });

  it("maps the env switch to the version frozen into new snapshots", () => {
    expect(generationPolicyVersionFromSwitch("true")).toBe("quality_recovery_v1");
    expect(generationPolicyVersionFromSwitch("false")).toBe("legacy");
    expect(generationPolicyVersionFromSwitch(undefined)).toBe("legacy");
    expect(generationPolicyVersionFromSwitch("yes")).toBe("legacy");
  });

  it("publishes the fact classes and origins the IA may never invent", () => {
    expect(CREATIVE_FACT_ORIGINS).toEqual(["request", "source", "brand", "catalog"]);
    expect(CREATIVE_FACT_CLASSES).toEqual(expect.arrayContaining([
      "price", "date", "benefit", "proof", "condition", "credential", "brand", "product", "service",
    ]));
  });

  it("round-trips the optional fact pack through the input snapshot", () => {
    const snapshot: CreativeWorkInputSnapshot = {
      request: "Grupo de terapia da Psicologia em agosto — vagas limitadas",
      settings: { targetFormats: [] },
      sources: [],
      factPack: {
        version: 1,
        request: "Grupo de terapia da Psicologia em agosto — vagas limitadas",
        facts: [
          { value: "agosto", class: "date", required: true, origin: "request" },
          { value: "vagas limitadas", class: "condition", required: true, origin: "request" },
          { value: "Pós-graduação", class: "product", required: false, origin: "source", sourceId: "source-1" },
          { value: "Cenbrap", class: "brand", required: true, origin: "brand" },
        ],
        brand: { requiredElements: ["logo"], prohibitedElements: ["clipart"] },
        identity: { clientProfileId: "profile-1", brandName: "Cenbrap" },
      },
    };
    const restored = JSON.parse(JSON.stringify(snapshot)) as CreativeWorkInputSnapshot;
    expect(resolveCreativeWorkFactPack(restored)).toEqual(snapshot.factPack);
  });

  it("round-trips the versioned inferred briefing and rejects confidence on sourced fields", () => {
    const briefing = {
      version: 1,
      message: { value: "Matrículas", state: "sourced" },
      objective: { value: "Gerar inscrições", state: "inferred", confidence: "medium" },
      audience: { value: null, state: "unknown" },
      offer: { value: null, state: "unknown" },
      tone: { value: "Direto", state: "sourced" },
      constraints: { value: null, state: "unknown" },
      readiness: "exploratory",
      confidence: "low",
    } as const;
    expect(inferredBriefingSchema.parse(JSON.parse(JSON.stringify(briefing)))).toEqual(briefing);
    expect(resolveCreativeWorkInferredBriefing({ inferredBriefing: briefing })).toEqual(briefing);
    expect(() => inferredBriefingSchema.parse({
      ...briefing,
      message: { value: "Matrículas", state: "sourced", confidence: "high" },
    })).toThrow();
  });

  it("keeps snapshots without a fact pack readable and resolves unknown blocks as absent", () => {
    const legacySnapshot = {
      request: "Promoção",
      settings: { targetFormats: [] },
      sources: [],
    } as CreativeWorkInputSnapshot;
    expect(resolveCreativeWorkFactPack(legacySnapshot)).toBeNull();
    expect(resolveCreativeWorkFactPack(null)).toBeNull();
    expect(resolveCreativeWorkFactPack(undefined)).toBeNull();
    expect(
      resolveCreativeWorkFactPack({ ...legacySnapshot, factPack: { version: 99, garbage: true } as never }),
    ).toBeNull();
  });

  it("accepts a brief with empty audience so missing targeting stays absent", () => {
    const parsed = socialPostBriefSchema.parse({
      theme: "Tema",
      objective: "Objetivo",
      audience: "",
      offer: "Oferta",
    });
    expect(parsed.audience).toBe("");
  });

  it("keeps an unknown offer null in the legacy adapter", () => {
    expect(socialPostBriefSchema.parse({ theme: "Tema", objective: "Objetivo", audience: "", offer: null }).offer).toBeNull();
    expect(() => socialPostBriefSchema.parse({ theme: "Tema", objective: "Objetivo", audience: "", offer: "" })).toThrow();
  });

  it("resolves completed only when all three outputs completed", () => {
    expect(resolveCreativeWorkStatus(["completed", "completed", "completed"])).toBe("completed");
  });

  it("publishes the supported intents and source contracts", () => {
    expect(CREATIVE_WORK_INTENTS).toEqual([
      "social_post",
      "variations",
      "single",
      "format_adaptation",
      "restyle",
      "carousel",
    ]);
    expect(CREATIVE_SOURCE_USAGES).toEqual(["content", "style", "both"]);
    expect(CREATIVE_SOURCE_STATUSES).toEqual([
      "uploaded",
      "analyzing",
      "ready",
      "failed",
    ]);
  });

  it("refuses to quote a carousel intent because the deck quotes itself", () => {
    expect(() => quoteCreativeWork({ intent: "carousel", format: "4:5", targetFormats: [] }))
      .toThrow("carousel_requires_deck_quote");
  });

  it("carries the optional carousel draft on the settings envelope", () => {
    const draft: CarouselDraftStateV1 = {
      version: 1,
      revision: "draft-r1",
      answers: {},
      blockingQuestions: [],
      plan: null,
      changes: [],
    };
    const settings: CreativeWorkSettings = { targetFormats: [], carouselDraft: draft };
    const restored = JSON.parse(JSON.stringify(settings)) as CreativeWorkSettings;
    expect(restored.carouselDraft).toEqual(draft);
  });

  it("carries the optional carousel editorial envelope beside the textual deck", () => {
    const settings: CreativeWorkSettings = {
      targetFormats: [],
      carouselEditorial: {
        version: 1,
        revision: "rev-1",
        contextHash: "ctx-1",
        research: {
          status: "not_needed",
          question: "",
          thesis: "",
          sources: [],
          claims: [],
          gaps: [],
        },
        hooks: [],
        recommendedHookId: null,
        recommendation: null,
        selectedHookId: null,
        storyboard: [],
        caption: null,
        approvedScriptRevision: null,
        approvedCover: null,
        confirmedInteriorsRevision: null,
      },
    };
    const restored = JSON.parse(JSON.stringify(settings)) as CreativeWorkSettings;
    expect(restored.carouselEditorial?.version).toBe(1);
    expect(restored.carouselDraft).toBeUndefined();
  });

  it.each([
    [{ intent: "variations" as const, format: "4:5" as const, targetFormats: [] }, { unitCount: 3, credits: 150 }],
    [{ intent: "single" as const, format: "4:5" as const, targetFormats: [] }, { unitCount: 1, credits: 50 }],
    [{ intent: "format_adaptation" as const, format: "4:5" as const, targetFormats: ["1:1", "9:16"] as const }, { unitCount: 2, credits: 100 }],
  ])("quotes %o", (input, expected) => {
    expect(quoteCreativeWork(input)).toMatchObject(expected);
  });

  it("quotes one output per selected direction when a direction pool is present", () => {
    const directionPool = {
      version: 1,
      directions: [
        { id: "00000000-0000-4000-8000-0000000000d1", label: "A", instruction: "Make it A", order: 0, safetyBand: "experimental" as const, provenance: "manual" as const },
        { id: "00000000-0000-4000-8000-0000000000d2", label: "B", instruction: "Make it B", order: 1, safetyBand: "safe" as const, provenance: "ai-suggestion" as const },
      ],
      selectedIds: ["00000000-0000-4000-8000-0000000000d2"],
      manualInstruction: "Global",
    };
    const quote = quoteCreativeWork({ intent: "social_post", format: "4:5", targetFormats: [], directionPool });
    expect(quote.plans).toEqual([
      {
        creativeLevel: "balanced",
        targetFormat: "4:5",
        versionNumber: 1,
        directionId: "00000000-0000-4000-8000-0000000000d2",
        directionSnapshot: { label: "B", instruction: "Make it B", order: 1, safetyBand: "safe" },
      },
    ]);
    expect(quote.unitCount).toBe(1);
    expect(quote.credits).toBe(50);
  });

  it("falls back to three levels when the direction pool is absent", () => {
    const quote = quoteCreativeWork({ intent: "variations", format: "4:5", targetFormats: [] });
    expect(quote.plans).toHaveLength(3);
    expect(quote.plans.every((plan) => plan.directionId === undefined)).toBe(true);
  });

  it("throws when a selected direction id is not present in the pool", () => {
    const directionPool = {
      version: 1,
      directions: [
        { id: "00000000-0000-4000-8000-0000000000d1", label: "A", instruction: "A", order: 0, safetyBand: "safe" as const, provenance: "default" as const },
      ],
      selectedIds: ["00000000-0000-4000-8000-0000000000d1", "00000000-0000-4000-8000-0000000000d2"],
      manualInstruction: null,
    };
    expect(() => quoteCreativeWork({ intent: "social_post", format: "4:5", targetFormats: [], directionPool }))
      .toThrow("selected direction id not found in pool: 00000000-0000-4000-8000-0000000000d2");
  });

  it("rejects duplicated selected direction ids so a single output is never double-charged", () => {
    const parsed = creativeDirectionPoolSchema.safeParse({
      version: 1,
      directions: [
        { id: "00000000-0000-4000-8000-0000000000d1", label: "A", instruction: "A", order: 0, safetyBand: "safe", provenance: "default" },
        { id: "00000000-0000-4000-8000-0000000000d2", label: "B", instruction: "B", order: 1, safetyBand: "safe", provenance: "default" },
      ],
      selectedIds: ["00000000-0000-4000-8000-0000000000d1", "00000000-0000-4000-8000-0000000000d1", "00000000-0000-4000-8000-0000000000d2"],
      manualInstruction: null,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message === "selectedIdsMustBeUnique" && issue.path.join(".") === "selectedIds.1")).toBe(true);
  });

  it("rejects a persisted pool with more than five directions and accepts exactly five", () => {
    const direction = (index: number) => ({
      id: `00000000-0000-4000-8000-0000000000d${index}`,
      label: `D${index}`,
      instruction: `Instruction ${index}`,
      order: index,
      safetyBand: "safe",
      provenance: "default",
    });
    const parsed = creativeDirectionPoolSchema.safeParse({
      version: 1,
      directions: [0, 1, 2, 3, 4, 5].map(direction),
      selectedIds: ["00000000-0000-4000-8000-0000000000d0"],
      manualInstruction: null,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.code === "too_big" && issue.path.join(".") === "directions")).toBe(true);

    const atCap = creativeDirectionPoolSchema.safeParse({
      version: 1,
      directions: [0, 1, 2, 3, 4].map(direction),
      selectedIds: ["00000000-0000-4000-8000-0000000000d0"],
      manualInstruction: null,
    });
    expect(atCap.success).toBe(true);
  });

  it("quotes exactly one output per target format without duplicates", () => {
    const quote = quoteCreativeWork({
      intent: "format_adaptation",
      format: "4:5",
      targetFormats: ["1:1", "9:16", "1:1"],
    });
    expect(quote.plans).toEqual([
      { creativeLevel: "balanced", targetFormat: "1:1", versionNumber: 1 },
      { creativeLevel: "balanced", targetFormat: "9:16", versionNumber: 1 },
    ]);
    expect(quote.unitCount).toBe(2);
    expect(quote.credits).toBe(100);
  });

  it("keeps migration 0075 backward compatible while backfilling new columns", () => {
    const migration = readFileSync("drizzle/0075_frictionless_creative_work.sql", "utf8");
    const updates = migration.match(/UPDATE\s+"adscale_app"\."creative_work_(?:items|outputs)"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(2);

    const assignedColumns = updates.flatMap((update) => {
      const assignments = update.match(/SET\s+([\s\S]*?)(?:\nFROM|\nWHERE|;)/)?.[1] ?? "";
      return [...assignments.matchAll(/"([a-z_]+)"\s*=/g)].map((match) => match[1]);
    });
    expect(assignedColumns).toEqual([
      "title", "request", "settings",
      "target_format", "version_number", "retry_count", "operation_key",
    ]);
    const protectedColumns = [
      "id", "status", "output_key", "cost", "failure_code", "quality", "is_selected",
    ];
    expect(assignedColumns.filter((column) => protectedColumns.includes(column))).toEqual([]);

    expect(migration).toContain('COALESCE(NULLIF("brief"->>\'theme\', \'\'), \'Trabalho criativo\')');
    expect(migration).toContain("NULLIF(\"brief\"->>'theme', '')");
    expect(migration).toContain("NULLIF(\"brief\"->>'offer', '')");
    expect(migration).toContain("NULLIF(\"brief\"->>'objective', '')");
    expect(migration).not.toContain('"request" = "brief"::text');
    expect(migration).toContain('"settings" = \'{"targetFormats":[]}\'::jsonb');
    expect(migration).toContain('"target_format" = work."format"');
    expect(migration).toContain('"operation_key" = output."creative_level" || \':\' || work."format" || \':1\'');
    expect(migration).toContain('ALTER COLUMN "brief" DROP NOT NULL');
    expect(migration).toContain('CREATE UNIQUE INDEX "creative_work_items_draft_key_uq"');
    expect(migration).toContain('WHERE "draft_key" is not null');
    expect(migration).toContain('CREATE UNIQUE INDEX "creative_work_outputs_plan_uq"');
    expect(migration).toContain('CREATE UNIQUE INDEX "creative_work_outputs_operation_uq"');
    expect(migration).toContain('CONSTRAINT "creative_work_outputs_parent_fk" FOREIGN KEY ("parent_output_id")');
    expect(migration).toContain('CONSTRAINT "creative_work_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id")');
    expect(migration).not.toContain('DROP INDEX "adscale_app"."creative_work_outputs_selected_uq"');
    expect(migration).toContain('CONSTRAINT "creative_work_sources_origin_check" CHECK (num_nonnulls("asset_id", "template_id") = 1)');
    expect(migration).toContain('CREATE UNIQUE INDEX "creative_work_sources_asset_uq" ON "adscale_app"."creative_work_sources" ("work_item_id", "asset_id") WHERE "asset_id" is not null');
    expect(migration).toContain('CREATE UNIQUE INDEX "creative_work_sources_template_uq" ON "adscale_app"."creative_work_sources" ("work_item_id", "template_id") WHERE "template_id" is not null');
    expect(migration).toContain('REFERENCES "adscale_app"."workspace_assets"("id") ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES "adscale_app"."campaign_templates"("id") ON DELETE CASCADE');
  });

  it("caps explicit briefing people at three UUIDs and keeps legacy settings valid", () => {
    const settings: CreativeWorkSettings = { targetFormats: [] };
    expect(creativeWorkSettingsSchema.safeParse(settings).success).toBe(true);
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    expect(creativeWorkSettingsSchema.safeParse({ targetFormats: [], personIds: ids }).success).toBe(true);
    expect(creativeWorkSettingsSchema.safeParse({ targetFormats: [], personIds: [...ids, ids[0]] }).success).toBe(false);
    expect(creativeWorkSettingsSchema.safeParse({ targetFormats: [], personIds: ["ana"] }).success).toBe(false);
  });

  it("validates the frozen person snapshot strictly", () => {
    const person = {
      personId: "11111111-1111-4111-8111-111111111111",
      name: "Ana",
      referenceIds: ["22222222-2222-4222-8222-222222222222"],
      primaryReferenceId: "22222222-2222-4222-8222-222222222222",
      preserve: ["formato do rosto"],
    };
    expect(creativeWorkPersonSnapshotSchema.safeParse(person).success).toBe(true);
    expect(creativeWorkPersonSnapshotSchema.safeParse({ ...person, referenceIds: [] }).success).toBe(false);
  });

  it("accepts an explicit visual language id and validates the frozen direction", () => {
    expect(creativeWorkSettingsSchema.safeParse({
      targetFormats: [],
      visualLanguageId: "22222222-2222-4222-8222-222222222222",
    }).success).toBe(true);
    expect(creativeWorkSettingsSchema.safeParse({
      targetFormats: [],
      visualLanguageId: "comercial",
    }).success).toBe(false);
    const direction = {
      languageId: "22222222-2222-4222-8222-222222222222",
      ruleIds: ["11111111-1111-4111-8111-111111111111"],
      dominantIdea: "Dar ao título escala superior ao texto de apoio",
      composition: "Respiro generoso ao redor do foco",
      typography: "Usar caixa alta condensada nos títulos",
      finish: "Acabamento fosco editorial",
      preserve: ["Competição de dois focos"],
    };
    expect(creativeWorkVisualDirectionSchema.safeParse(direction).success).toBe(true);
    expect(creativeWorkVisualDirectionSchema.safeParse({ ...direction, languageId: null }).success).toBe(true);
    expect(creativeWorkVisualDirectionSchema.safeParse({ ...direction, dominantIdea: "" }).success).toBe(false);
    expect(creativeWorkVisualDirectionSchema.safeParse({
      ...direction,
      ruleIds: Array.from({ length: 31 }, () => "11111111-1111-4111-8111-111111111111"),
    }).success).toBe(false);
    expect(creativeWorkVisualDirectionSchema.safeParse({ ...direction, languageId: "comercial" }).success).toBe(false);
  });

  it("resolves the frozen refinement budget and prices 3 units per root (plan 04, T1)", () => {
    expect(resolveCreativeWorkArtRefinement(null)).toBeNull();
    expect(resolveCreativeWorkArtRefinement({})).toBeNull();
    const budget = {
      version: 1 as const,
      maxRevisionsPerRoot: 2 as const,
      acceptedCreditCeiling: 30,
      acceptedBy: "user-1",
      acceptedAt: "2026-09-13T00:00:00.000Z",
    };
    expect(resolveCreativeWorkArtRefinement({ artRefinement: budget })).toEqual(budget);
    expect(resolveCreativeWorkArtRefinement({ artRefinement: { ...budget, maxRevisionsPerRoot: 3 } })).toBeNull();
    const unit = artRefinementCreditCeiling(1);
    expect(artRefinementCreditCeiling(4)).toBe(unit * 4);
    expect(unit).toBeGreaterThan(0);
  });
});
