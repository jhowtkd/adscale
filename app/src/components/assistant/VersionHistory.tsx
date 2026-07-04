"use client";

import { CheckCircle2, History, PencilLine } from "lucide-react";
import { useState } from "react";
import type { ArtifactVersionPresentation } from "@/lib/assistant/artifact-version";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssistantSurface } from "./AssistantSurfaceContext";

export interface VersionHistoryProps {
  threadId: string;
  lineages: ArtifactVersionPresentation[];
  isLoading?: boolean;
}

type Lineage = ArtifactVersionPresentation;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function lineageLabel(lineage: Lineage, index: number, lineages: Lineage[]) {
  const label = lineage.artifactType === "plan" ? "Plano" : "Criativo";
  const sameType = lineages.filter(
    (candidate) => candidate.artifactType === lineage.artifactType
  );
  if (sameType.length === 1) return label;
  return `${label} ${sameType.indexOf(lineage) + 1 || index + 1}`;
}

function originLabel(origin: string) {
  if (origin === "legacy_import") return "Importada";
  if (origin === "revision") return "Revisão";
  return "Original";
}

function HistorySkeleton() {
  return (
    <div
      className="mt-3 space-y-2"
      role="status"
      aria-label="Carregando histórico de versões"
    >
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          data-testid="version-history-skeleton"
          className="rounded-md border border-[var(--border-dim)] p-3"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function VersionHistory({
  threadId,
  lineages,
  isLoading = false,
}: VersionHistoryProps) {
  const { openVersionComparison } = useAssistantSurface();
  const [selectedLineageId, setSelectedLineageId] = useState<string | null>(null);
  const selectedLineage =
    lineages.find((lineage) => lineage.lineageId === selectedLineageId) ??
    lineages[0] ??
    null;

  const openPair = (lineage: Lineage, versionAId: string, versionBId: string) => {
    if (versionAId === versionBId) return;
    openVersionComparison({
      threadId,
      lineageId: lineage.lineageId,
      artifactType: lineage.artifactType,
      versionAId,
      versionBId,
    });
  };

  const official = selectedLineage?.approvedCurrent ?? null;
  const working = selectedLineage?.working ?? null;
  const compareAnchor = official ?? working;
  const versions = [...(selectedLineage?.versions ?? [])].sort(
    (left, right) => right.versionNumber - left.versionNumber
  );
  const otherVersion = versions.find((version) => version.id !== working?.id);
  const defaultVersionAId = official?.id ?? otherVersion?.id ?? null;
  const defaultVersionBId = working?.id ?? null;
  const hasDefaultPair = Boolean(
    defaultVersionAId && defaultVersionBId && defaultVersionAId !== defaultVersionBId
  );

  return (
    <section data-testid="version-history" aria-labelledby="version-history-title">
      <div className="flex items-center gap-2">
        <History className="size-4 text-[var(--text-muted)]" aria-hidden="true" />
        <h3
          id="version-history-title"
          className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
        >
          Histórico de versões
        </h3>
      </div>

      {isLoading ? (
        <HistorySkeleton />
      ) : lineages.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-[var(--border-dim)] p-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Ainda não há versões para comparar
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            As revisões confirmadas aparecerão aqui com origem, estado e histórico.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {lineages.length > 1 ? (
            <label className="block text-xs text-[var(--text-secondary)]">
              Linha do artefato
              <select
                className="mt-1 h-9 w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 text-sm text-[var(--text-primary)]"
                value={selectedLineage?.lineageId ?? ""}
                onChange={(event) => setSelectedLineageId(event.target.value)}
              >
                {lineages.map((lineage, index) => (
                  <option key={lineage.lineageId} value={lineage.lineageId}>
                    {lineageLabel(lineage, index, lineages)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full whitespace-normal"
              disabled={!hasDefaultPair}
              onClick={() => {
                if (!selectedLineage || !defaultVersionAId || !defaultVersionBId) return;
                openPair(selectedLineage, defaultVersionAId, defaultVersionBId);
              }}
            >
              {official
                ? "Comparar oficial e versão em trabalho"
                : "Comparar versões em trabalho"}
            </Button>
            {!hasDefaultPair ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Crie ou selecione outra versão para comparar.
              </p>
            ) : null}
          </div>

          <ol className="space-y-2">
            {versions.map((version) => {
              const isOfficial = official?.id === version.id;
              const isWorking = working?.id === version.id;
              const comparisonBase =
                official ?? versions.find((candidate) => candidate.id !== version.id);
              const wasOfficial =
                !isOfficial &&
                (version.previouslyApproved || version.status === "approved");
              return (
                <li
                  key={version.id}
                  className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-[var(--text-primary)]">
                      v{version.versionNumber}
                    </span>
                    {isOfficial ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        Oficial
                      </span>
                    ) : null}
                    {isWorking ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <PencilLine className="size-3.5" aria-hidden="true" />
                        Em trabalho
                      </span>
                    ) : null}
                    {wasOfficial ? (
                      <span className="text-xs text-[var(--text-secondary)]">
                        Oficial anteriormente
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {dateFormatter.format(version.createdAt)} · {originLabel(version.provenance.origin)}
                  </p>
                  {version.feedback ? (
                    <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">
                      {version.feedback}
                    </p>
                  ) : null}
                  {!isOfficial && comparisonBase ? (
                    <button
                      type="button"
                      className="mt-2 min-h-11 text-left text-xs font-medium text-[var(--accent-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                      onClick={() => openPair(selectedLineage!, comparisonBase.id, version.id)}
                    >
                      {official ? "Comparar com a oficial" : "Comparar para aprovar"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
