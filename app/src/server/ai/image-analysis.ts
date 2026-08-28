import { env } from "@/server/validation/env";
import { extractOutputText, getOpenAI } from "@/server/ai/utils";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import { z } from "zod";
import { PIECE_REFERENCE_CATEGORIES } from "@/server/creative-work/piece-reference";

export const contentBriefSchema = z.object({
  summaryPt: z.string().trim().min(1).optional(),
  literalText: z.string().optional(),
  entities: z.array(z.string()).optional(),
  product: z.string(),
  offer: z.string(),
  cta: z.object({ text: z.string(), style: z.string() }),
  brandElements: z.array(z.string()),
  keyVisual: z.string(),
  textContent: z.object({ headline: z.string(), bullets: z.array(z.string()) }),
  format: z.string(),
  pieceReference: z.object({
    category: z.enum(PIECE_REFERENCE_CATEGORIES).nullable(),
    confidence: z.enum(["high", "medium", "low"]),
  }).optional(),
});
export type ContentBrief = z.infer<typeof contentBriefSchema>;

export function normalizeContentBrief(brief: ContentBrief): ContentBrief {
  const summaryPt = brief.summaryPt?.trim() || [
    brief.product ? `Produto: ${brief.product}` : "",
    brief.offer ? `Oferta: ${brief.offer}` : "",
    brief.cta.text ? `CTA: ${brief.cta.text}` : "",
  ].filter(Boolean).join(" · ");

  return {
    ...brief,
    ...(summaryPt ? { summaryPt } : {}),
    ...(brief.literalText?.trim() ? { literalText: brief.literalText.trim() } : {}),
    ...(brief.entities?.length ? { entities: brief.entities.filter(Boolean) } : {}),
  };
}

const CONTENT_SYSTEM_PROMPT = `You are an advertising image analyst. Extract structured content from the provided ad image.
Return ONLY a JSON object with this exact structure:
{
  "summaryPt": "resumo curto e escaneável em português brasileiro; não traduza nomes próprios",
  "literalText": "texto exatamente como aparece na arte, preservando idioma, acentos e pontuação",
  "entities": ["entidades ou fatos identificados"],
  "product": "what is being advertised",
  "offer": "discounts, promotions, pricing mentioned",
  "cta": { "text": "call-to-action text", "style": "button appearance" },
  "brandElements": ["logos", "brand colors", "taglines"],
  "keyVisual": "main photo or subject",
  "textContent": { "headline": "main headline", "bullets": ["bullet points"] },
  "format": "aspect ratio and layout"
}
Write all reader-facing descriptions in Brazilian Portuguese. Never translate or normalize literalText.`;

export async function analyzeImageContent(
  imageBuffer: Buffer,
  mimeType: string,
  options: { classifyPieceReference?: boolean } = {},
): Promise<ContentBrief> {
  if (isE2EControlledProviderEnabled()) {
    return contentBriefSchema.parse({
      summaryPt: "Produto da arte · Oferta da arte · CTA: Saiba mais",
      literalText: "Headline da arte",
      entities: ["Produto da arte"],
      product: "Produto da arte",
      offer: "Oferta da arte",
      cta: { text: "Saiba mais", style: "botão" },
      brandElements: ["marca controlada"],
      keyVisual: "produto em destaque",
      textContent: { headline: "Headline da arte", bullets: [] },
      format: "4:5",
      ...(options.classifyPieceReference ? { pieceReference: { category: "product_or_packaging", confidence: "high" as const } } : {}),
    });
  }
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      {
        role: "system",
        content: options.classifyPieceReference
          ? `${CONTENT_SYSTEM_PROMPT}\nAlso include pieceReference with category one of ${PIECE_REFERENCE_CATEGORIES.join(", ")} (or null) and confidence high, medium, or low. Use low when uncertain.`
          : CONTENT_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Extract the creative content as the requested JSON." },
          {
            type: "input_image",
            image_url: dataUrl,
            detail: "high",
          },
        ],
      },
    ],
    text: { format: { type: "json_object" } },
  });

  const raw = extractOutputText(response);
  if (!raw) {
    throw new Error("Empty vision response for content analysis");
  }

  const jsonString = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();
  return normalizeContentBrief(contentBriefSchema.parse(JSON.parse(jsonString)));
}

export const styleBriefSchema = z.object({
  palette: z.array(z.object({ hex: z.string(), labelPt: z.string() })).optional(),
  colorPalette: z.object({ dominant: z.array(z.string()), accents: z.array(z.string()), gradients: z.string() }),
  typography: z.object({
    personality: z.string(),
    effects: z.array(z.string()),
    family: z.string().optional(),
    weight: z.string().optional(),
    stylePt: z.string().optional(),
  }),
  textures: z.array(z.string()),
  composition: z.string(),
  compositionPt: z.string().optional(),
  mood: z.string(),
  moodChipsPt: z.array(z.string()).optional(),
  decorativeElements: z.array(z.string()),
  photoTreatment: z.string(),
});
export type StyleBrief = z.infer<typeof styleBriefSchema>;

const HEX_COLOR_RE = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;

export function normalizeStyleBrief(style: StyleBrief): StyleBrief {
  const rawColors = [...style.colorPalette.dominant, ...style.colorPalette.accents];
  const palette = style.palette?.length
    ? style.palette
    : rawColors
      .filter((color) => HEX_COLOR_RE.test(color.trim()))
      .map((hex) => ({ hex: hex.trim(), labelPt: hex.trim() }));
  const moodChipsPt = style.moodChipsPt?.filter(Boolean).length
    ? style.moodChipsPt.filter(Boolean)
    : style.mood.split(/[,;·]+/).map((chip) => chip.trim()).filter(Boolean);

  return {
    ...style,
    ...(palette.length ? { palette } : {}),
    ...(moodChipsPt.length ? { moodChipsPt } : {}),
    ...(style.compositionPt?.trim() ? { compositionPt: style.compositionPt.trim() } : { compositionPt: style.composition }),
    typography: {
      ...style.typography,
      ...(style.typography.stylePt?.trim()
        ? { stylePt: style.typography.stylePt.trim() }
        : { stylePt: style.typography.personality }),
    },
  };
}

const STYLE_SYSTEM_PROMPT = `You are a visual style analyst. Analyze the provided image as a STYLE SOURCE ONLY.
Extract visual language elements: color palette, typography personality, textures, composition style, mood, decorative elements, and photo treatment.
Do NOT describe the subject matter or content — only the visual style.
Return ONLY a JSON object with this exact structure:
{
  "palette": [{ "hex": "#112233", "labelPt": "azul profundo" }],
  "colorPalette": { "dominant": ["color1", "color2"], "accents": ["accent1"], "gradients": "description" },
  "typography": { "personality": "grunge, elegante, bold, etc", "family": "família se identificável", "weight": "peso se identificável", "stylePt": "descrição curta em português", "effects": ["bordas rasgadas", "brilho", "contorno"] },
  "textures": ["grain", "halftone", "noise"],
  "composition": "camadas, colagem, centralizada, etc",
  "compositionPt": "descrição curta da composição em português",
  "mood": "escura, energética, nostálgica, etc",
  "moodChipsPt": ["energética", "institucional"],
  "decorativeElements": ["shapes", "badges", "stickers"],
  "photoTreatment": "black & white, duotone, high contrast, etc"
}
Use Brazilian Portuguese for descriptions. Do not call an image generator.`;

export async function analyzeImageStyle(
  imageBuffer: Buffer,
  mimeType: string
): Promise<StyleBrief> {
  if (isE2EControlledProviderEnabled()) {
    return styleBriefSchema.parse({
      palette: [{ hex: "#ff0080", labelPt: "rosa vibrante" }, { hex: "#20c060", labelPt: "verde" }],
      colorPalette: { dominant: ["#ff0080"], accents: ["#20c060"], gradients: "nenhum" },
      typography: { personality: "direta", effects: [] },
      textures: [],
      composition: "centralizada",
      compositionPt: "composição centralizada",
      mood: "direto e vibrante",
      moodChipsPt: ["direto", "vibrante"],
      decorativeElements: [],
      photoTreatment: "alto contraste",
    });
  }
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      { role: "system", content: STYLE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Extract the visual style as the requested JSON." },
          {
            type: "input_image",
            image_url: dataUrl,
            detail: "high",
          },
        ],
      },
    ],
    text: { format: { type: "json_object" } },
  });

  const raw = extractOutputText(response);
  if (!raw) {
    throw new Error("Empty vision response for style analysis");
  }

  const jsonString = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();
  return normalizeStyleBrief(styleBriefSchema.parse(JSON.parse(jsonString)));
}
