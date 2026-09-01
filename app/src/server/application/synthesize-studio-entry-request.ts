import { z } from "zod";
import { formatEntryRequestTemplate } from "@/lib/studio/entry-request-template";
import { ENTRY_PROTOCOLS, type EntryFacts, type EntryLocale } from "@/lib/studio/entry-types";
import { getOpenAI } from "@/server/ai/utils";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import { env } from "@/server/validation/env";

const MAX_REQUEST_LENGTH = 240;

const SYSTEM_PROMPT = `Você escreve um único pedido curto para um composer de anúncios.
Use somente os campos fornecidos. Não invente oferta, preço, benefício, público ou tom.
Se um campo estiver ausente, omita-o. Responda só o JSON { "sentence": string }.`;

const entryFactsSchema = z.object({
  protocol: z.enum(ENTRY_PROTOCOLS).nullable(),
  offer: z.string().trim().max(MAX_REQUEST_LENGTH).nullable(),
  audience: z.string().trim().max(MAX_REQUEST_LENGTH).nullable(),
  tone: z.string().trim().max(MAX_REQUEST_LENGTH).nullable(),
});

const entryChipsSchema = z.object({
  protocol: z.enum(ENTRY_PROTOCOLS).optional(),
  offer: z.string().trim().max(MAX_REQUEST_LENGTH).optional(),
  audience: z.string().trim().max(MAX_REQUEST_LENGTH).optional(),
  tone: z.string().trim().max(MAX_REQUEST_LENGTH).optional(),
}).default({});

export const entryRequestBodySchema = z.object({
  facts: entryFactsSchema,
  chips: entryChipsSchema,
  locale: z.enum(["pt-BR", "en"]),
}).strict();

export type EntryRequestBody = z.infer<typeof entryRequestBodySchema>;

function truncateRequest(value: string): string {
  return value.length <= MAX_REQUEST_LENGTH ? value : value.slice(0, MAX_REQUEST_LENGTH);
}

function mergeEntryFacts(facts: EntryFacts, chips: Partial<EntryFacts>): EntryFacts {
  return { ...facts, ...chips };
}

function buildPromptFields(facts: EntryFacts): string {
  const fields: string[] = [];
  if (facts.protocol) fields.push(`protocol: ${facts.protocol}`);
  if (facts.offer) fields.push(`offer: ${facts.offer}`);
  if (facts.audience) fields.push(`audience: ${facts.audience}`);
  if (facts.tone) fields.push(`tone: ${facts.tone}`);
  return fields.join("\n");
}

function templateResult(facts: EntryFacts, locale: EntryLocale) {
  return {
    sentence: truncateRequest(formatEntryRequestTemplate(facts, locale)),
    requestSource: "template" as const,
  };
}

function inventedPriceWithoutOffer(sentence: string, facts: EntryFacts): boolean {
  return !facts.offer && /R\$\s*\d/i.test(sentence);
}

export async function synthesizeStudioEntryRequest(input: {
  workspaceId: string;
  facts: EntryFacts;
  chips: Partial<EntryFacts>;
  locale: EntryLocale;
}): Promise<{ sentence: string; requestSource: "template" | "model" }> {
  void input.workspaceId;
  const merged = mergeEntryFacts(input.facts, input.chips);

  if (isE2EControlledProviderEnabled()) {
    return templateResult(merged, input.locale);
  }

  try {
    const response = await getOpenAI().chat.completions.create({
      model: env.OPENAI_TEXT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPromptFields(merged) || "(nenhum campo)" },
      ],
      max_completion_tokens: 120,
      response_format: { type: "json_object" },
    }, { timeout: 8_000 });

    const content = response.choices[0]?.message?.content;
    if (!content) return templateResult(merged, input.locale);

    const parsed = JSON.parse(content) as { sentence?: unknown };
    const sentence = typeof parsed.sentence === "string" ? parsed.sentence.trim() : "";
    if (!sentence || inventedPriceWithoutOffer(sentence, merged)) {
      return templateResult(merged, input.locale);
    }

    return {
      sentence: truncateRequest(sentence),
      requestSource: "model" as const,
    };
  } catch {
    return templateResult(merged, input.locale);
  }
}
