"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { CalibrationRuleCandidate } from "@/server/brand-taste/calibration-signal-types";

type BrandRulesResponse = {
  clientProfileId: string;
  workspaceId: string;
  approved: CalibrationRuleCandidate[];
  candidate: CalibrationRuleCandidate[];
};

const CONFIDENCE_LABELS: Record<CalibrationRuleCandidate["confidence"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

async function fetchBrandRules(
  clientProfileId: string
): Promise<BrandRulesResponse | "forbidden"> {
  const res = await apiFetch(`/api/admin/quality/brands/${clientProfileId}/rules`);
  if (res.status === 403) return "forbidden";
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as BrandRulesResponse;
}

function RulesTable({
  rules,
  showApprovedAt,
}: {
  rules: CalibrationRuleCandidate[];
  showApprovedAt: boolean;
}) {
  if (rules.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
        Nenhuma regra nesta seção.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
      <table className="min-w-full text-xs">
        <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Categoria</th>
            <th className="px-2 py-1.5 text-left font-medium">Racional</th>
            <th className="px-2 py-1.5 text-left font-medium">Confiança</th>
            {showApprovedAt ? (
              <th className="px-2 py-1.5 text-left font-medium">Aprovada em</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-t border-[var(--border-dim)]">
              <td className="px-2 py-1.5 font-mono text-[10px]">{rule.category}</td>
              <td
                className="max-w-md px-2 py-1.5 text-[var(--text-secondary)]"
                title={rule.rationale}
              >
                {truncate(rule.rationale)}
              </td>
              <td className="px-2 py-1.5">{CONFIDENCE_LABELS[rule.confidence]}</td>
              {showApprovedAt ? (
                <td className="px-2 py-1.5 text-[var(--text-muted)]">
                  {rule.approvedAt
                    ? new Date(rule.approvedAt).toLocaleString("pt-BR")
                    : "—"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BrandCalibrationRulesPanel({
  clientProfileId,
}: {
  clientProfileId: string;
}) {
  const rulesQuery = useQuery({
    queryKey: ["brand-calibration-rules", clientProfileId],
    queryFn: () => fetchBrandRules(clientProfileId),
    retry: false,
  });

  if (rulesQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Carregando regras de calibração…</p>;
  }

  if (rulesQuery.data === "forbidden") {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        As regras de calibração são restritas a proprietários da plataforma.
      </p>
    );
  }

  if (rulesQuery.isError) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Não foi possível carregar as regras de calibração.
      </p>
    );
  }

  if (!rulesQuery.data) {
    return null;
  }

  const { approved, candidate } = rulesQuery.data;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Regras aprovadas</h3>
        <RulesTable rules={approved} showApprovedAt />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Regras pendentes (candidatas)
        </h3>
        <RulesTable rules={candidate} showApprovedAt={false} />
      </section>
    </div>
  );
}
