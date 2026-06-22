"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type CorpusIngestionStatus = {
  eligibleDerivations: number;
  totalCandidates: number;
  pendingQueue: number;
  evaluated: number;
  blockedMissingClientProfile: number;
};

type CorpusBackfillResult = {
  processed: number;
  created: number;
  promoted: number;
  skipped: number;
  blocked: number;
  nextCursor: { createdAt: string; id: string } | null;
};

async function fetchIngestionStatus(): Promise<CorpusIngestionStatus | null> {
  const res = await apiFetch("/api/admin/quality/ingestion/status");
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as CorpusIngestionStatus;
}

export function CorpusIngestionBanner() {
  const queryClient = useQueryClient();
  const [backfillSummary, setBackfillSummary] = useState<string | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["corpus-ingestion-status"],
    queryFn: fetchIngestionStatus,
    retry: false,
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/admin/quality/ingestion/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchSize: 500 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error as string | undefined) ?? "Backfill failed");
      }
      return (await res.json()) as CorpusBackfillResult;
    },
    onSuccess: (result) => {
      setBackfillError(null);
      setBackfillSummary(
        `Backfill batch: processed ${result.processed}, created ${result.created}, promoted ${result.promoted}, skipped ${result.skipped}, blocked ${result.blocked}.`
      );
      void queryClient.invalidateQueries({ queryKey: ["corpus-ingestion-status"] });
      void queryClient.invalidateQueries({ queryKey: ["human-quality-corpus-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["corpus-candidates"] });
    },
    onError: (error: Error) => {
      setBackfillSummary(null);
      setBackfillError(error.message);
    },
  });

  if (statusQuery.isFetched && statusQuery.data === null) {
    return null;
  }

  if (statusQuery.isLoading) {
    return (
      <p className="text-xs text-[var(--text-muted)]" aria-label="Corpus ingestion status">
        Loading ingestion status…
      </p>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return null;
  }

  const status = statusQuery.data;

  return (
    <div
      className="space-y-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2"
      aria-label="Corpus ingestion status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
          <span>
            <span className="text-[var(--text-muted)]">Eligible:</span>{" "}
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              {status.eligibleDerivations}
            </span>
          </span>
          <span>
            <span className="text-[var(--text-muted)]">Candidates:</span>{" "}
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              {status.totalCandidates}
            </span>
          </span>
          <span>
            <span className="text-[var(--text-muted)]">Pending queue:</span>{" "}
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              {status.pendingQueue}
            </span>
          </span>
          <span>
            <span className="text-[var(--text-muted)]">Evaluated:</span>{" "}
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              {status.evaluated}
            </span>
          </span>
          <span>
            <span className="text-[var(--text-muted)]">Blocked:</span>{" "}
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              {status.blockedMissingClientProfile}
            </span>
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={backfillMutation.isPending}
          onClick={() => backfillMutation.mutate()}
        >
          {backfillMutation.isPending ? "Running backfill…" : "Backfill batch"}
        </Button>
      </div>
      {backfillSummary ? (
        <p className="text-xs text-emerald-200">{backfillSummary}</p>
      ) : null}
      {backfillError ? <p className="text-xs text-rose-400">{backfillError}</p> : null}
    </div>
  );
}
