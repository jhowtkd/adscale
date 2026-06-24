"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PerBrandEvidenceReport } from "@/server/brand-taste/calibration-evidence";
import type { CalibrationSourceLabel } from "@/server/brand-taste/calibration-signal-types";
import { getCalibrationStatusDisplay } from "./calibration-status-copy";
import { SOURCE_LABELS } from "./BrandTasteProfilePanel";

const CLAIM_LABELS: Record<string, string> = {
  customer_real_validation: "Validação com cliente real",
  commercial_quality_claim: "Afirmação de qualidade comercial",
  validated_against_customer_real: "Validado contra cliente real",
  calibrated_from_operator_decisions: "Calibrado a partir de decisões do operador",
  agreement_rate_reported: "Taxa de concordância reportada",
  initial_art_direction_rules_applied: "Regras iniciais de direção de arte aplicadas",
  system_applies_learned_brand_criteria: "Sistema aplica critérios de marca aprendidos",
};

function formatClaimLabel(key: string): string {
  return CLAIM_LABELS[key] ?? key;
}

export async function fetchBrandEvidence(
  clientProfileId: string
): Promise<PerBrandEvidenceReport | "forbidden"> {
  const res = await apiFetch(`/api/admin/quality/brands/${clientProfileId}/evidence`);
  if (res.status === 403) return "forbidden";
  if (!res.ok) throw new Error("failed");
  const data = (await res.json()) as { report: PerBrandEvidenceReport };
  return data.report;
}

function ClaimsList({
  title,
  claimKeys,
  testId,
  emptyMessage,
}: {
  title: string;
  claimKeys: string[];
  testId: string;
  emptyMessage: string;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
      {claimKeys.length === 0 ? (
        <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-muted)]">
          {emptyMessage}
        </p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          {claimKeys.map((key) => (
            <li key={key}>{formatClaimLabel(key)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BrandEvidencePanel({ clientProfileId }: { clientProfileId: string }) {
  const evidenceQuery = useQuery({
    queryKey: ["brand-evidence", clientProfileId],
    queryFn: () => fetchBrandEvidence(clientProfileId),
    retry: false,
  });

  if (evidenceQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Carregando evidência da marca…</p>;
  }

  if (evidenceQuery.data === "forbidden") {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        A evidência da marca é restrita a proprietários da plataforma.
      </p>
    );
  }

  if (evidenceQuery.isError) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Não foi possível carregar a evidência da marca.
      </p>
    );
  }

  if (!evidenceQuery.data) {
    return null;
  }

  const report = evidenceQuery.data;
  const status = getCalibrationStatusDisplay({
    fixtureOnly: report.fixtureOnly,
    evidenceLevel: report.evidenceLevel,
    sourceComposition: report.sourceComposition,
    decisionCount: report.decisionCount,
  });

  const customerRealBlocked = report.claimsBlocked.includes("validated_against_customer_real");

  return (
    <div className="space-y-6">
      <div
        className={
          status.variant === "warning"
            ? "rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
            : "rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
        }
      >
        <p className="font-medium">{status.label}</p>
        {status.bannerText ? (
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{status.bannerText}</p>
        ) : null}
        {customerRealBlocked ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Validação com cliente real ainda não disponível para esta marca.
          </p>
        ) : null}
      </div>

      {report.fixtureOnly && report.fixtureCaveat ? (
        <div
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
          data-testid="fixture-caveat-banner"
        >
          <p className="font-medium">Aviso de fixture</p>
          <p className="mt-1 text-xs">{report.fixtureCaveat}</p>
        </div>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Composição de fontes</h3>
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Fonte</th>
                <th className="px-2 py-1.5 text-right font-medium">Contagem</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(SOURCE_LABELS) as CalibrationSourceLabel[]).map((key) => (
                <tr key={key} className="border-t border-[var(--border-dim)]">
                  <td className="px-2 py-1.5">{SOURCE_LABELS[key]}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {report.sourceComposition[key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <ClaimsList
          title="Afirmações permitidas"
          claimKeys={report.claimsAllowed}
          testId="claims-allowed"
          emptyMessage="Nenhuma afirmação liberada no momento."
        />
        <ClaimsList
          title="Afirmações bloqueadas"
          claimKeys={report.claimsBlocked}
          testId="claims-blocked"
          emptyMessage="Nenhuma afirmação bloqueada."
        />
      </div>

      {report.missingConditions.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Condições pendentes</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
            {report.missingConditions.map((condition, index) => (
              <li key={`missing-${index}`}>{condition}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
