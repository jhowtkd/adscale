import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getClientProfile } from "@/server/repositories/client-reference";
import { resolvePreviewUrl } from "@/server/served-ads/previews";
import {
  buildServedAdsReport,
  loadReportSource,
  parseServedAdsQuery,
  reportToCsv,
} from "@/server/served-ads/report";

/**
 * GET /api/served-ads — relatório Anúncios veiculados (#346, ICE-01B).
 * Sem Conexão Meta, roda com fixture (mode=fixture) — nenhuma chamada à Meta.
 * Evento (`event`) escolhido no escopo; `export=csv` devolve a mesma
 * consulta em CSV. Tela, exportação e cache partilham o mesmo builder,
 * query e chave — mesmo evento, período e versão.
 */
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);
    const parsed = parseServedAdsQuery(searchParams);
    if (!parsed.ok) return apiError("invalidInput", 400, parsed.issues);

    const brand = await getClientProfile(workspace.id, parsed.query.brandId);
    if (!brand) return apiError("clientProfileNotFound", 404);

    const source = await loadReportSource({
      workspaceId: workspace.id,
      brandId: parsed.query.brandId,
      windowDays: parsed.query.windowDays,
      format: parsed.query.format,
      event: parsed.query.event,
    });
    const report = buildServedAdsReport({
      scope: {
        brandId: parsed.query.brandId,
        workspaceId: workspace.id,
        windowDays: parsed.query.windowDays,
        format: parsed.query.format,
        event: parsed.query.event,
        mode: source.mode,
      },
      sources: source.sources,
    });

    if (parsed.query.exportFormat === "csv") {
      const filename = `served-ads-${parsed.query.windowDays}d-${parsed.query.event ?? "no-event"}.csv`;
      return new NextResponse(reportToCsv(report), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const keysByAnuncio = new Map<string, { imageKey: string | null; thumbKey: string | null }>();
    if (source.mode === "live") {
      for (const item of source.sources) {
        if (!item.row.creative_id || !item.media) continue;
        const anuncioId = `${item.row.ad_account_id}:${item.row.creative_id}`;
        if (!keysByAnuncio.has(anuncioId)) keysByAnuncio.set(anuncioId, item.media);
      }
    }
    const items = await Promise.all(
      report.rows.map(async (row) => ({
        anuncioId: row.anuncio_id,
        format: row.format,
        text: row.text,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
        // Null = não medido; soma legada vem sinalizada via `conversion`.
        conversions: row.conversions,
        ctr: row.ctr,
        cpc: row.cpc,
        cpa: row.cpa,
        conversion: {
          definitionVersion: row.conversion.definitionVersion,
          actionType: row.conversion.actionType,
          value: row.conversion.value,
          status: row.conversion.status,
        },
        insufficientEvidence: row.sem_evidencia,
        // Live resolve para URL assinada do R2; null = placeholder de formato.
        previewUrl:
          source.mode === "live"
            ? await resolvePreviewUrl(keysByAnuncio.get(row.anuncio_id) ?? {})
            : null,
      }))
    );
    return NextResponse.json({
      mode: report.meta.mode,
      currencies: report.summary.currencies,
      primaryCurrency: report.summary.currencies[0] ?? "BRL",
      hasConversions: report.rows.some((row) => (row.conversions ?? 0) > 0),
      event: report.meta.event,
      availableEvents: report.meta.availableEvents,
      windowDays: report.meta.windowDays,
      format: report.meta.format,
      definitionVersion: report.meta.definitionVersion,
      collectionComplete: report.meta.collectionComplete,
      generatedAt: report.meta.generatedAt,
      summary: report.summary,
      rows: items,
    });
  } catch (error) {
    return handleApiError(error, "served-ads.GET");
  }
}
