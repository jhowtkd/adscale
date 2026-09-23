import "server-only";
import { buildAnuncioId } from "./aggregate";
import { CONVERSION_DEFINITION_VERSION } from "./conversion";
import { decryptMetaToken } from "./crypto";
import {
  getGraphClient,
  isMockMode,
  META_GRAPH_VERSION,
  type MetaAd,
  type MetaGraphClient,
  type MetaInsight,
} from "./graph";
import { getConnectionByWorkspace, listServedAdRows } from "./repository";
import { normalizeInsightActions } from "./sync";

/**
 * Gates do relatório (ICE-01B, spec #383 §ICE-01): contrato da API usada +
 * reconciliação com resposta real autorizada. Sem acesso à Meta, o aceite
 * de produção segue pendente — o gate prova a pendência, nunca presume.
 */

export interface ServedAdsApiContract {
  graphVersion: string;
  definitionVersion: number;
  /** Nenhum parâmetro de atribuição é enviado; a efetiva segue desconhecida. */
  attribution: "unknown_until_reconciled";
  requiredInsightFields: string[];
  requiredClientMethods: string[];
}

export const SERVED_ADS_API_CONTRACT: ServedAdsApiContract = {
  graphVersion: META_GRAPH_VERSION,
  definitionVersion: CONVERSION_DEFINITION_VERSION,
  attribution: "unknown_until_reconciled",
  requiredInsightFields: ["adId", "impressions", "clicks", "spend", "actions", "complete"],
  requiredClientMethods: ["listAdAccounts", "listAds", "getInsights"],
};

export type ContractCheck =
  | { ok: true; insights: MetaInsight[] }
  | { ok: false; violations: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Valida uma resposta de insights contra o contrato: campos presentes,
 * tipos íntegros, contagens não negativas. Qualquer violação falha o gate
 * antes de qualquer comparação — sem fallback silencioso.
 */
export function validateApiContract(raw: unknown): ContractCheck {
  if (!Array.isArray(raw)) return { ok: false, violations: ["response_not_an_array"] };
  const violations: string[] = [];
  const insights: MetaInsight[] = [];
  raw.forEach((item, index) => {
    const at = `insight[${index}]`;
    if (!isRecord(item)) {
      violations.push(`${at}_not_an_object`);
      return;
    }
    if (typeof item.adId !== "string" || !item.adId) violations.push(`${at}.adId_invalid`);
    if (!isNonNegativeNumber(item.impressions)) violations.push(`${at}.impressions_invalid`);
    if (!isNonNegativeNumber(item.clicks)) violations.push(`${at}.clicks_invalid`);
    if (!isNonNegativeNumber(item.spend)) violations.push(`${at}.spend_invalid`);
    if (!Array.isArray(item.actions)) {
      violations.push(`${at}.actions_not_an_array`);
    } else {
      item.actions.forEach((action, actionIndex) => {
        if (
          !isRecord(action) ||
          typeof action.actionType !== "string" ||
          !action.actionType ||
          !isNonNegativeNumber(action.value)
        ) {
          violations.push(`${at}.actions[${actionIndex}]_invalid`);
        }
      });
    }
    if (typeof item.complete !== "boolean") violations.push(`${at}.complete_invalid`);
    if (violations.length === 0 || !violations.some((v) => v.startsWith(at))) {
      insights.push(item as unknown as MetaInsight);
    }
  });
  return violations.length > 0 ? { ok: false, violations } : { ok: true, insights };
}

export interface ReconcileLine {
  anuncioId: string;
  windowDays: number;
  impressions: number;
  clicks: number;
  spend: number;
  actionCounts: Record<string, number>;
}

export interface LineDivergence {
  anuncioId: string;
  windowDays: number;
  field: string;
  stored: number | null;
  fresh: number | null;
}

export interface ReconcileReport {
  lines: number;
  matched: number;
  diverged: LineDivergence[];
}

/** Tolerância de arredondamento de moeda (centavo); contagens são exatas. */
export const SPEND_EPSILON = 0.01;

function lineKey(line: Pick<ReconcileLine, "anuncioId" | "windowDays">): string {
  return `${line.windowDays}|${line.anuncioId}`;
}

/**
 * Compara guardado × fresco campo a campo. Linha só de um lado diverge
 * como ausente — nunca como zero presumido.
 */
export function reconcileLines(stored: ReconcileLine[], fresh: ReconcileLine[]): ReconcileReport {
  const storedByKey = new Map(stored.map((line) => [lineKey(line), line]));
  const freshByKey = new Map(fresh.map((line) => [lineKey(line), line]));
  const keys = [...new Set([...storedByKey.keys(), ...freshByKey.keys()])].sort();
  const diverged: LineDivergence[] = [];
  let matched = 0;
  for (const key of keys) {
    const oldLine = storedByKey.get(key);
    const newLine = freshByKey.get(key);
    if (!oldLine && newLine) {
      diverged.push({
        anuncioId: newLine.anuncioId,
        windowDays: newLine.windowDays,
        field: "line_missing_stored",
        stored: null,
        fresh: null,
      });
      continue;
    }
    if (oldLine && !newLine) {
      diverged.push({
        anuncioId: oldLine.anuncioId,
        windowDays: oldLine.windowDays,
        field: "line_missing_fresh",
        stored: null,
        fresh: null,
      });
      continue;
    }
    if (!oldLine || !newLine) continue;
    const before = diverged.length;
    if (oldLine.impressions !== newLine.impressions) {
      diverged.push({ anuncioId: oldLine.anuncioId, windowDays: oldLine.windowDays, field: "impressions", stored: oldLine.impressions, fresh: newLine.impressions });
    }
    if (oldLine.clicks !== newLine.clicks) {
      diverged.push({ anuncioId: oldLine.anuncioId, windowDays: oldLine.windowDays, field: "clicks", stored: oldLine.clicks, fresh: newLine.clicks });
    }
    if (Math.abs(oldLine.spend - newLine.spend) >= SPEND_EPSILON) {
      diverged.push({ anuncioId: oldLine.anuncioId, windowDays: oldLine.windowDays, field: "spend", stored: oldLine.spend, fresh: newLine.spend });
    }
    const types = [...new Set([...Object.keys(oldLine.actionCounts), ...Object.keys(newLine.actionCounts)])].sort();
    for (const type of types) {
      const oldValue = oldLine.actionCounts[type] ?? 0;
      const newValue = newLine.actionCounts[type] ?? 0;
      if (oldValue !== newValue) {
        diverged.push({ anuncioId: oldLine.anuncioId, windowDays: oldLine.windowDays, field: `actions:${type}`, stored: oldValue, fresh: newValue });
      }
    }
    if (diverged.length === before) matched += 1;
  }
  return { lines: keys.length, matched, diverged };
}

export interface ReconcileScope {
  workspaceId: string;
  brandId: string;
  windows: Array<7 | 30 | 90>;
}

export type GateStatus = "pass" | "fail" | "pending";

export interface GateOutcome {
  status: GateStatus;
  reason: string;
  contract: ServedAdsApiContract;
  report?: ReconcileReport;
  violations?: string[];
  checkedAt: string;
}

export interface ReconcileConnection {
  id: string;
  status: string;
  tokenCiphertext: string | null;
}

export interface ReconcileDeps {
  now?: Date;
  client?: MetaGraphClient;
  mockMode?: boolean;
  getConnection?: (workspaceId: string) => Promise<ReconcileConnection | null>;
  loadStored?: (workspaceId: string, brandId: string, windowDays: number) => Promise<ReconcileLine[]>;
}

async function defaultLoadStored(
  workspaceId: string,
  brandId: string,
  windowDays: number
): Promise<ReconcileLine[]> {
  const rows = await listServedAdRows(workspaceId, brandId, windowDays);
  return rows
    .filter((row) => row.creative_id)
    .map((row) => ({
      anuncioId: buildAnuncioId(row.ad_account_id, row.creative_id as string),
      windowDays,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      actionCounts: row.actionCounts ?? {},
    }));
}

function pending(reason: string, now: Date): GateOutcome {
  return { status: "pending", reason, contract: SERVED_ADS_API_CONTRACT, checkedAt: now.toISOString() };
}

/**
 * Executa os gates: contrato da resposta fresca primeiro; depois a
 * reconciliação guardado × fresco. Sem resposta real autorizada, pendente.
 */
export async function runReconcile(
  scope: ReconcileScope,
  deps: ReconcileDeps = {}
): Promise<GateOutcome> {
  const now = deps.now ?? new Date();
  if (deps.mockMode ?? isMockMode()) {
    return pending("mock_mode_no_real_response", now);
  }
  const getConnection = deps.getConnection ?? getConnectionByWorkspace;
  const connection = await getConnection(scope.workspaceId);
  if (!connection) return pending("connection_not_found", now);
  if (connection.status !== "ativa") return pending("connection_not_active", now);
  if (!connection.tokenCiphertext) return pending("connection_token_missing", now);

  const client = deps.client ?? getGraphClient(decryptMetaToken(connection.tokenCiphertext));
  const loadStored = deps.loadStored ?? defaultLoadStored;

  const fresh: ReconcileLine[] = [];
  const stored: ReconcileLine[] = [];
  const accounts = await client.listAdAccounts();
  const adsByAccount = new Map<string, Map<string, MetaAd>>();
  for (const windowDays of scope.windows) {
    stored.push(...(await loadStored(scope.workspaceId, scope.brandId, windowDays)));
    for (const account of accounts) {
      let adsById = adsByAccount.get(account.id);
      if (!adsById) {
        const ads = await client.listAds(account.id);
        adsById = new Map(ads.map((ad) => [ad.id, ad]));
        adsByAccount.set(account.id, adsById);
      }
      const contract = validateApiContract(await client.getInsights(account.id, windowDays));
      if (!contract.ok) {
        return {
          status: "fail",
          reason: "contract_violation",
          contract: SERVED_ADS_API_CONTRACT,
          violations: contract.violations,
          checkedAt: now.toISOString(),
        };
      }
      const grouped = new Map<string, ReconcileLine>();
      for (const insight of contract.insights) {
        const ad = adsById.get(insight.adId);
        if (!ad || !ad.creative.id) continue;
        const anuncioId = buildAnuncioId(account.id, ad.creative.id);
        const normalized = normalizeInsightActions(insight.actions);
        const line = grouped.get(anuncioId) ?? {
          anuncioId,
          windowDays,
          impressions: 0,
          clicks: 0,
          spend: 0,
          actionCounts: {},
        };
        line.impressions += insight.impressions;
        line.clicks += insight.clicks;
        line.spend += insight.spend;
        for (const [type, value] of Object.entries(normalized.counts)) {
          line.actionCounts[type] = (line.actionCounts[type] ?? 0) + value;
        }
        grouped.set(anuncioId, line);
      }
      fresh.push(...grouped.values());
    }
  }

  const report = reconcileLines(stored, fresh);
  return {
    status: report.diverged.length === 0 ? "pass" : "fail",
    reason: report.diverged.length === 0 ? "reconciled" : "divergence",
    contract: SERVED_ADS_API_CONTRACT,
    report,
    checkedAt: now.toISOString(),
  };
}
