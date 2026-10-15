import "server-only";
import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAI } from "@/server/ai/utils";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import {
  newModelCallId,
  observeModelCall,
  reportModelValidationFailed,
  summarizeChatCompletion,
} from "@/server/diagnostics/model-calls";
import { env } from "@/server/validation/env";
import { getCreativeWorkPromptVersion, logCreativeWorkPromptVersion } from "@/server/shared-skills";
import { UNTRUSTED_DATA_RECEIVED_CONTEXT_PT_BR, UNTRUSTED_DATA_RULE_PT_BR } from "@/server/shared-skills-texts";
import { recordComposerGuidanceApplication } from "../repositories/composer-guidance-application";
import type { BuildCreativeWorkPromptInput } from "./prompt";
import type { FrozenSinglePieceGuidance } from "../brand-taste/single-piece-guidance";
import { appendArtDirectionGuidance, resolveArtDirectionGuidance } from "./art-direction-guidance";

export type ArtDirectionInput = Pick<BuildCreativeWorkPromptInput,
  "format" | "copy" | "inputSnapshot" | "factPack" | "identitySnapshot" | "creativeLevel" | "revisionInstruction" | "references"
> & {
  directionInstruction: string | null;
  frozenGuidance?: FrozenSinglePieceGuidance | null;
  generationMode?: string;
  applicationScope: { workspaceId: string; workItemId: string; outputId: string };
};

export type ArtDirectionResult =
  | { text: string; source: "model" | "controlled" }
  | { text: null; source: "fallback"; reason: "unavailable" | "invalid_response" };

const schema = z.object({ brief: z.string().trim().min(1).max(1600) }).strict();
const system = `Escreva uma direção visual em português, com até 120 palavras: conceito, hierarquia, tratamento tipográfico, paleta e espaço dos assets exatos. ${UNTRUSTED_DATA_RULE_PT_BR} ${UNTRUSTED_DATA_RECEIVED_CONTEXT_PT_BR} Não invente nem altere nomes, fatos, ofertas, preços, datas ou copy. Não repetir toda a copy no brief. Respeite os papéis das referências e as instruções visuais do operador.`;

export async function createSinglePieceArtDirection(input: ArtDirectionInput): Promise<ArtDirectionResult> {
  if (isE2EControlledProviderEnabled()) {
    return { text: "Composição editorial com hierarquia clara, tipografia legível, paleta declarada e espaço livre para os assets exatos. Preserve a base e aplique apenas os ajustes solicitados.", source: "controlled" };
  }
  const kit = input.identitySnapshot.brandKit;
  const modelContext = {
    format: input.format, copy: input.copy, request: input.inputSnapshot.request,
    factPack: input.factPack, creativeLevel: input.creativeLevel,
    directionInstruction: input.directionInstruction, revisionInstruction: input.revisionInstruction,
    visualDirection: input.inputSnapshot.visualDirection
      ? {
          dominantIdea: input.inputSnapshot.visualDirection.dominantIdea,
          composition: input.inputSnapshot.visualDirection.composition,
          typography: input.inputSnapshot.visualDirection.typography,
          finish: input.inputSnapshot.visualDirection.finish,
          preserve: input.inputSnapshot.visualDirection.preserve,
        }
      : null,
    brandKit: {
      colors: kit.colors, fonts: kit.fonts, toneOfVoice: kit.toneOfVoice,
      visualNotes: kit.visualNotes, constraints: kit.constraints,
      requiredElements: kit.requiredElements, prohibitedElements: kit.prohibitedElements,
    },
    assets: input.identitySnapshot.assets.map(({ label, category, usageMode, placement, compositionInstruction }) =>
      ({ label, category, usageMode, placement, compositionInstruction })),
    references: input.references.map(({ role, label, required, pieceReference }) =>
      ({ role, label, required, pieceReference })),
  };
  const generationMode = input.generationMode ?? "single";
  const promptVersion = getCreativeWorkPromptVersion(
    generationMode === "creative_revision" || generationMode === "format_adaptation" ? "refinement" : "composer",
  );
  const guidance = resolveArtDirectionGuidance(input.frozenGuidance, promptVersion, { format: input.format, generationMode });
  const model = env.OPENAI_TEXT_MODEL;
  const trace = { callId: newModelCallId(), provider: "openai", requestedModel: model, stage: "art_direction" as const };
  let content: string | null | undefined;
  try {
    const response = await observeModelCall(trace, async () => {
      const client = getOpenAI();
      const request = {
        model,
        messages: [{ role: "system", content: appendArtDirectionGuidance(system, guidance) }, { role: "user", content: JSON.stringify(modelContext) }],
        response_format: zodResponseFormat(schema, "single_piece_art_direction"),
        max_completion_tokens: 500,
      } satisfies Parameters<typeof client.chat.completions.create>[0];
      try {
        await recordComposerGuidanceApplication({
          ...input.applicationScope,
          application: {
            callId: trace.callId, callName: "art_direction", consumer: "art_direction", role: "art_direction",
            executionId: input.applicationScope.outputId, fixedPromptVersion: promptVersion,
            ...guidance.identity,
            promptFingerprint: createHash("sha256").update(JSON.stringify(request.messages), "utf8").digest("hex"),
          },
        });
      } catch (error) {
        // Attribution is auxiliary; its failure must not replace the planned model call with fallback.
        logger.warn(`[artDirection] guidance record failed outputId=${input.applicationScope.outputId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      logCreativeWorkPromptVersion({
        promptVersion,
        operation: "art_direction",
        callId: trace.callId,
      });
      return client.chat.completions.create(request, { timeout: 30_000, maxRetries: 0 });
    }, summarizeChatCompletion);
    content = response.choices[0]?.message?.content;
  } catch {
    return { text: null, source: "fallback", reason: "unavailable" };
  }
  try {
    const parsed = schema.safeParse(JSON.parse(content ?? "null"));
    if (parsed.success && parsed.data.brief.split(/\s+/u).length <= 120) {
      return { text: parsed.data.brief, source: "model" };
    }
    reportModelValidationFailed({ ...trace, reason: "schema-mismatch" });
  } catch {
    // Malformed model output uses the existing generative prompt, never a second text call.
    reportModelValidationFailed({ ...trace, reason: "invalid-json" });
  }
  return { text: null, source: "fallback", reason: "invalid_response" };
}
