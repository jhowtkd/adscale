import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getClientProfile } from "@/server/repositories/client-reference";
import { aggregateAdRows, sortReportRows, type ServedAdFormat } from "@/server/served-ads/aggregate";
import { getFixtureAdRows } from "@/server/served-ads/fixture";
import { resolvePreviewUrl } from "@/server/served-ads/previews";
import { hasMetaConnection, listServedAdRows, type ServedAdDbRow } from "@/server/served-ads/repository";

const querySchema = z.object({
  brandId: z.string().uuid(),
  window: z.enum(["7", "30", "90"]).default("30"),
  format: z.enum(["imagem", "video", "carrossel"]).optional(),
});

/**
 * GET /api/served-ads — relatório Anúncios veiculados (#346).
 * Sem Conexão Meta, roda com fixture (mode=fixture) — nenhuma chamada à Meta.
 */
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      brandId: searchParams.get("brandId"),
      window: searchParams.get("window") ?? undefined,
      format: searchParams.get("format") ?? undefined,
    });
    if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());

    const brand = await getClientProfile(workspace.id, parsed.data.brandId);
    if (!brand) return apiError("clientProfileNotFound", 404);

    const windowDays = Number(parsed.data.window) as 7 | 30 | 90;
    const format = parsed.data.format as ServedAdFormat | undefined;
    const connected = await hasMetaConnection(workspace.id);

    const sourceRows = connected
      ? await listServedAdRows(workspace.id, parsed.data.brandId, windowDays, format)
      : getFixtureAdRows(windowDays).filter((row) => !format || row.format === format);
    const currencies = connected
      ? [...new Set(sourceRows.map((row) => (row as { currency?: string }).currency ?? "BRL"))]
      : ["BRL"];

    const rows = sortReportRows(aggregateAdRows(sourceRows));
    const keysByAnuncio = new Map<string, { imageKey: string | null; thumbKey: string | null }>();
    if (connected) {
      for (const source of sourceRows as ServedAdDbRow[]) {
        const anuncioId = `${source.ad_account_id}:${source.creative_id}`;
        if (!keysByAnuncio.has(anuncioId)) {
          keysByAnuncio.set(anuncioId, { imageKey: source.imageKey, thumbKey: source.thumbKey });
        }
      }
    }
    const items = await Promise.all(
      rows.map(async (row) => ({
        anuncioId: row.anuncio_id,
        format: row.format,
        text: row.text,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
        conversions: row.conversions,
        ctr: row.ctr,
        cpc: row.cpc,
        cpa: row.cpa,
        insufficientEvidence: row.sem_evidencia,
        // Live resolve para URL assinada do R2; null = placeholder de formato.
        previewUrl: connected
          ? await resolvePreviewUrl(keysByAnuncio.get(row.anuncio_id) ?? {})
          : null,
      }))
    );
    return NextResponse.json({
      mode: connected ? "live" : "fixture",
      currencies,
      primaryCurrency: currencies[0] ?? "BRL",
      hasConversions: rows.some((row) => row.conversions > 0),
      rows: items,
    });
  } catch (error) {
    return handleApiError(error, "served-ads.GET");
  }
}
