"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useCreditHistory } from "@/lib/hooks/use-billing";
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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

function getDateRange(range: string) {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let from: Date;

  switch (range) {
    case "thisMonth":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last3Months":
      from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      break;
    case "thisYear":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      from = new Date(2020, 0, 1);
  }

  return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
}

export default function CreditHistoryTab() {
  const t = useTranslations("creditHistory");
  const tc = useTranslations("common");
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

  const { data, isLoading } = useCreditHistory(queryParams);

  const transactions = data?.transactions ?? [];
  const summary = data?.summary;
  const campaigns = data?.campaigns ?? [];

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type !== "usage" || tx.amount >= 0) continue;
      const date = tx.createdAt ? tx.createdAt.split("T")[0] : "";
      grouped.set(date, (grouped.get(date) ?? 0) + Math.abs(tx.amount));
    }
    const sorted = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([date, amount]) => ({ date, amount }));
  }, [transactions]);

  const typeColors: Record<string, string> = {
    usage: "#ef4444",
    refund: "#22c55e",
    grant: "#3b82f6",
    purchase: "#2FB67D",
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label={t("totalSpent")}
          value={summary ? summary.totalSpent.toString() : "—"}
        />
        <SummaryCard
          label={t("remainingCredits")}
          value={summary ? summary.remainingCredits.toString() : "—"}
        />
        <SummaryCard
          label={t("averagePerCampaign")}
          value={summary ? summary.averagePerCampaign.toString() : "—"}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <span className="block text-xs font-medium text-[var(--text-secondary)]">
            {t("filterDateRange")}
          </span>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v ?? "thisMonth")}>
            <SelectTrigger className="w-44" size="sm">
              <SelectValue />
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
              <SelectValue />
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
        <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4">
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            {t("usageOverTime")}
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
                  tickFormatter={(value: string) => {
                    const d = new Date(value);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12, fill: "var(--text-secondary)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-base)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: unknown) => [`${value} créditos`, "Uso"]}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill="#2FB67D" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)]">
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
            {isLoading ? (
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
                      ? new Date(tx.createdAt).toLocaleDateString("pt-BR")
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
                        background: `${typeColors[tx.type] ?? "#6b7280"}20`,
                        color: typeColors[tx.type] ?? "#6b7280",
                      }}
                    >
                      {t(`types.${tx.type}`)}
                    </span>
                  </TableCell>
                  <TableCell
                    className="font-medium"
                    style={{
                      color: tx.amount < 0 ? "#ef4444" : "#22c55e",
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
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
