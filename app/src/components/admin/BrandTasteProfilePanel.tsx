"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type {
  BrandTastePattern,
  BrandTasteProfile,
  CalibrationSourceLabel,
} from "@/server/brand-taste/calibration-signal-types";
import { getCalibrationStatusDisplay } from "./calibration-status-copy";

export type BrandProfileResponse = BrandTasteProfile & {
  fixtureOnly: boolean;
  corpusSignalsNote: string | null;
};

export const SOURCE_LABELS: Record<CalibrationSourceLabel, string> = {
  synthetic_fixture: "Fixture sintético",
  operator_imported: "Importado pelo operador",
  real_customer: "Cliente real",
};

const MISMATCH_BUCKET_LABELS: Record<string, string> = {
  system_too_permissive: "Sistema permissivo demais",
  system_too_harsh: "Sistema rígido demais",
  voice_nuance: "Nuance de voz",
  export_setup_issue: "Conflito de exportação",
  acceptable_override: "Override aceitável",
  unclear_sample: "Amostra ambígua",
};

export async function fetchBrandTasteProfile(
  clientProfileId: string
): Promise<BrandProfileResponse | "forbidden"> {
  const res = await apiFetch(`/api/admin/quality/brands/${clientProfileId}/profile`);
  if (res.status === 403) return "forbidden";
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as BrandProfileResponse;
}

function PatternGroup({
  title,
  patterns,
}: {
  title: string;
  patterns: BrandTastePattern[];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
      {patterns.length === 0 ? (
        <p className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-muted)]">
          Nenhum padrão registrado neste grupo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border-dim)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Resumo</th>
                <th className="px-2 py-1.5 text-left font-medium">Bucket</th>
                <th className="px-2 py-1.5 text-right font-medium">Contagem</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((pattern, index) => (
                <tr
                  key={`${title}-${index}`}
                  className="border-t border-[var(--border-dim)]"
                >
                  <td className="max-w-md px-2 py-1.5 text-[var(--text-secondary)]">
                    {pattern.rationale}
                  </td>
                  <td className="px-2 py-1.5 text-[var(--text-muted)]">
                    {pattern.mismatchBucket
                      ? (MISMATCH_BUCKET_LABELS[pattern.mismatchBucket] ??
                        pattern.mismatchBucket)
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pattern.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BrandTasteProfilePanel({ clientProfileId }: { clientProfileId: string }) {
  const profileQuery = useQuery({
    queryKey: ["brand-taste-profile", clientProfileId],
    queryFn: () => fetchBrandTasteProfile(clientProfileId),
    retry: false,
  });

  if (profileQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Carregando perfil de gosto…</p>;
  }

  if (profileQuery.data === "forbidden") {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        O perfil de gosto da marca é restrito a proprietários da plataforma.
      </p>
    );
  }

  if (profileQuery.isError) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Não foi possível carregar o perfil de gosto.
      </p>
    );
  }

  if (!profileQuery.data) {
    return null;
  }

  const profile = profileQuery.data;
  const status = getCalibrationStatusDisplay(profile);

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
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Composição de fontes
        </h3>
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
                    {profile.sourceComposition[key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {profile.caveats.length > 0 || profile.corpusSignalsNote ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Ressalvas</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
            {profile.caveats.map((caveat, index) => (
              <li key={`caveat-${index}`}>{caveat}</li>
            ))}
            {profile.corpusSignalsNote ? (
              <li key="corpus-note">{profile.corpusSignalsNote}</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <div className="space-y-5 border-t border-[var(--border-dim)] pt-6">
        <PatternGroup title="Padrões positivos" patterns={profile.positivePatterns} />
        <PatternGroup title="Padrões de rejeição" patterns={profile.rejectionPatterns} />
        <PatternGroup title="Quase acertos" patterns={profile.quasePatterns} />
      </div>
    </div>
  );
}
