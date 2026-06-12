"use client";

import {
  CONFIDENCE_LABELS,
  useCampaignLearnings,
  useRecomputeCampaignLearnings,
  type PerformanceLearning,
} from "@/lib/hooks/use-performance-learnings";

interface LearningsPanelProps {
  campaignId: string;
}

function LearningCard({ learning }: { learning: PerformanceLearning }) {
  return (
    <article className="rounded-md border border-[var(--border-dim)] bg-[var(--bg-elevated)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
          {learning.variableKey}
        </span>
        <span className="rounded bg-[var(--bg-surface)] px-2 py-0.5 text-xs">
          {CONFIDENCE_LABELS[learning.confidence]}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">
          v{learning.algorithmVersion}
        </span>
      </div>

      <p className="mt-2 text-[var(--text-primary)]">{learning.statement}</p>

      <dl className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
        <div>
          <dt className="font-medium text-[var(--text-primary)]">Amostra</dt>
          <dd>
            {learning.sampleImpressions.toLocaleString("pt-BR")} impressões ·{" "}
            {learning.sampleCampaignCount} campanha(s)
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text-primary)]">Recência</dt>
          <dd>
            {learning.lastEvidenceAt
              ? new Date(learning.lastEvidenceAt).toLocaleDateString("pt-BR")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text-primary)]">Contexto</dt>
          <dd>
            {learning.contextPlatforms.length > 0
              ? learning.contextPlatforms.join(", ")
              : "—"}
            {learning.contextObjectives.length > 0
              ? ` · ${learning.contextObjectives.join(", ")}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text-primary)]">Evidências</dt>
          <dd>
            {learning.supportingEvidence.length} favorável(is) ·{" "}
            {learning.contradictingEvidence.length} contraditória(s)
          </dd>
        </div>
      </dl>

      {learning.contradictingEvidence.length > 0 ? (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Há evidências contraditórias — trate como padrão contextual, não regra absoluta.
        </p>
      ) : null}
    </article>
  );
}

export default function LearningsPanel({ campaignId }: LearningsPanelProps) {
  const { data, isLoading, isError, error } = useCampaignLearnings(campaignId);
  const recompute = useRecomputeCampaignLearnings(campaignId);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">Carregando aprendizados…</p>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-red-500">
        {error instanceof Error ? error.message : "Falha ao carregar aprendizados."}
      </p>
    );
  }

  if (!data?.clientProfileId) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Vincule um perfil de cliente à campanha para consolidar aprendizados de performance.
      </p>
    );
  }

  const learnings = data.learnings ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-secondary)]">
          Fonte: {data.source === "mem0" ? "Mem0 + Postgres canônico" : "Postgres canônico"}
        </p>
        <button
          type="button"
          className="rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs hover:bg-[var(--bg-elevated)] disabled:opacity-50"
          disabled={recompute.isPending}
          onClick={() => recompute.mutate()}
        >
          {recompute.isPending ? "Recalculando…" : "Recalcular aprendizados"}
        </button>
      </div>

      {learnings.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Nenhum aprendizado aprovado ainda. Conclua comparações de hipóteses com evidência
          suficiente para gerar padrões reutilizáveis.
        </p>
      ) : (
        <div className="space-y-3">
          {learnings.map((learning) => (
            <LearningCard key={learning.id} learning={learning} />
          ))}
        </div>
      )}
    </div>
  );
}
