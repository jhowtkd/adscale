"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations, useLocale } from "next-intl";
import { useCreditHistory, useBillingStatus } from "@/lib/hooks/use-billing";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// One lazy chunk for the whole chart; see CreditUsageChart.
const CreditUsageChart = dynamic(() => import("./CreditUsageChart"), { ssr: false });
import {
  settingsButtonClass,
  settingsSectionTitleClass,
} from "@/components/settings/settings-chrome";

const TYPE_COLORS: Record<string, string> = {
  usage: "var(--danger-text)",
  refund: "var(--success-text)",
  grant: "var(--neutral-text)",
  purchase: "var(--success-text)",
};

const EMPTY_TRANSACTIONS: NonNullable<ReturnType<typeof useCreditHistory>["data"]>["transactions"] = [];
const EMPTY_CAMPAIGNS: NonNullable<ReturnType<typeof useCreditHistory>["data"]>["campaigns"] = [];
const EMPTY_USAGE_SERIES: NonNullable<ReturnType<typeof useCreditHistory>["data"]>["usageSeries"] = [];

function getDateRange(range: string): { from?: string; to?: string } {
  if (range === "allTime") {
    return {};
  }
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let from: Date;

  switch (range) {
    case "last3Months":
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case "thisYear":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    case "thisMonth":
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

export default function CreditHistoryTab() {
  const t = useTranslations("creditHistory");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [dateRange, setDateRange] = useState("thisMonth");
  const [campaignFilter, setCampaignFilter] = useState("all");

  const dateParams = useMemo(() => getDateRange(dateRange), [dateRange]);
  const queryParams = useMemo(
    () => ({
      from: dateParams.from,
      to: dateParams.to,
      campaignId: campaignFilter === "all" ? undefined : campaignFilter,
    }),
    [dateParams, campaignFilter]
  );

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useCreditHistory(queryParams);
  const { data: billingStatus } = useBillingStatus();

  const transactions = data?.transactions ?? EMPTY_TRANSACTIONS;
  const summary = data?.summary;
  const campaigns = data?.campaigns ?? EMPTY_CAMPAIGNS;
  const unlimited = billingStatus?.access?.unlimited === true;
  const selectedCampaignName =
    campaignFilter === "all"
      ? t("allCampaigns")
      : (campaigns.find((c) => c.id === campaignFilter)?.name ?? "—");

  // Daily usage over the whole filtered period, computed by the server.
  const chartData = data?.usageSeries ?? EMPTY_USAGE_SERIES;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <SummaryInline
          label={t("totalSpent")}
          value={summary ? summary.totalSpent.toString() : "—"}
        />
        <span className="hidden h-4 w-px bg-[var(--border-dim)] sm:block" aria-hidden />
        <SummaryInline
          label={t("remainingCredits")}
          value={unlimited ? t("unlimited") : (summary ? summary.remainingCredits.toString() : "—")}
        />
        <span className="hidden h-4 w-px bg-[var(--border-dim)] sm:block" aria-hidden />
        <SummaryInline
          label={t("averagePerCampaign")}
          value={summary ? summary.averagePerCampaign.toString() : "—"}
        />
      </dl>
      {unlimited ? (
        <p className="text-sm text-[var(--text-secondary)]">{t("unlimitedHint")}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <span className="block text-xs font-medium text-[var(--text-secondary)]">
            {t("filterDateRange")}
          </span>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v ?? "thisMonth")}>
            <SelectTrigger className="w-44" size="sm">
              <SelectValue>
                {t(dateRange as "thisMonth" | "last3Months" | "thisYear" | "allTime")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">{t("thisMonth")}</SelectItem>
              <SelectItem value="last3Months">{t("last3Months")}</SelectItem>
              <SelectItem value="thisYear">{t("thisYear")}</SelectItem>
              <SelectItem value="allTime">{t("allTime")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="block text-xs font-medium text-[var(--text-secondary)]">
            {t("filterCampaign")}
          </span>
          <Select value={campaignFilter} onValueChange={(v) => setCampaignFilter(v ?? "all")}>
            <SelectTrigger className="w-52" size="sm">
              <SelectValue>{selectedCampaignName}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allCampaigns")}</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div>
          <h3 className={`${settingsSectionTitleClass} mb-4`}>
            {t("usageOverTime")}
          </h3>
          <div className="h-48">
            <CreditUsageChart data={chartData} />
          </div>
        </div>
      )}

      {/* Table */}
      <div>
        <p className="mb-2 text-xs text-[var(--text-muted)]">{t("movementsNote")}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[var(--text-secondary)]">{t("date")}</TableHead>
              <TableHead className="text-[var(--text-secondary)]">{t("campaign")}</TableHead>
              <TableHead className="text-[var(--text-secondary)]">{t("derivation")}</TableHead>
              <TableHead className="text-[var(--text-secondary)]">{t("type")}</TableHead>
              <TableHead className="text-[var(--text-secondary)]">{t("amount")}</TableHead>
              <TableHead className="text-[var(--text-secondary)]">{t("description")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isError && !data ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-[var(--danger-text)]">
                  {tc("error")}
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-[var(--text-secondary)]">
                  {tc("loading")}
                </TableCell>
              </TableRow>
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-[var(--text-secondary)]">
                  {t("noTransactions")}
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-[var(--text-primary)]">
                    {tx.createdAt
                      ? new Date(tx.createdAt).toLocaleDateString(locale)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-[var(--text-primary)]">
                    {tx.campaignName ?? "—"}
                  </TableCell>
                  <TableCell className="text-[var(--text-primary)]">
                    {tx.derivationId ? tx.derivationId.slice(0, 8) + "…" : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: TYPE_COLORS[tx.type] ? `${TYPE_COLORS[tx.type]}20` : 'var(--neutral-bg)',
                        color: TYPE_COLORS[tx.type] ?? 'var(--text-secondary)',
                      }}
                    >
                      {t(`types.${tx.type}`)}
                    </span>
                  </TableCell>
                  <TableCell
                    className="font-medium"
                    style={{
                      color: tx.amount < 0 ? 'var(--danger-text)' : 'var(--success-text)',
                    }}
                  >
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-[var(--text-secondary)]">
                    {tx.description ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {hasNextPage ? (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className={settingsButtonClass}
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? t("loadingMore") : t("loadMore")}
            </button>
            {isFetchNextPageError ? (
              <span className="text-sm text-[var(--danger-text)]">{tc("error")}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-medium tabular-nums text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
