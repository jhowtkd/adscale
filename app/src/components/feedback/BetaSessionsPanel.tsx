"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { BETA_SESSION_STORAGE_KEY } from "@/lib/beta-analytics/constants";
import {
  BETA_RUNBOOK_STAGES,
  type BetaAssistanceLevel,
  type BetaRunbookStage,
  type BetaStageNote,
} from "@/server/beta-sessions/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BetaSession = {
  id: string;
  workspaceId: string;
  cohortLabel: string | null;
  assistanceLevel: string;
  startedAt: string;
  endedAt: string | null;
  operatorNotes: Partial<Record<BetaRunbookStage, BetaStageNote>>;
};

const STAGE_LABELS: Record<BetaRunbookStage, string> = {
  setup: "Session setup",
  readiness: "Creative readiness",
  guided_briefing: "Guided briefing",
  strategy_recipe: "Strategy recipe",
  preview: "Preview gate",
  batch: "Batch",
  review: "Approve derivations",
  export: "Export",
  share: "Client approval package",
};

async function fetchSessions(workspaceId: string, activeOnly: boolean) {
  const params = new URLSearchParams({ workspaceId, activeOnly: String(activeOnly) });
  const res = await apiFetch(`/api/feedback/beta-sessions?${params}`);
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as { sessions: BetaSession[] };
}

function setActiveSessionStorage(sessionId: string | null) {
  if (typeof window === "undefined") return;
  if (sessionId) {
    sessionStorage.setItem(BETA_SESSION_STORAGE_KEY, sessionId);
  } else {
    sessionStorage.removeItem(BETA_SESSION_STORAGE_KEY);
  }
}

async function copyToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(value);
  }
}

function CopyIdButton({
  label,
  copied,
  onCopy,
}: {
  label: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onCopy}>
      {copied ? "Copied!" : label}
    </Button>
  );
}

export function BetaSessionsPanel() {
  const queryClient = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState("");
  const [cohortLabel, setCohortLabel] = useState("");
  const [assistanceLevel, setAssistanceLevel] =
    useState<BetaAssistanceLevel>("hands_on");
  const [activeSession, setActiveSession] = useState<BetaSession | null>(null);
  const [stageDrafts, setStageDrafts] = useState<
    Partial<Record<BetaRunbookStage, BetaStageNote>>
  >({});
  const [copiedField, setCopiedField] = useState<"workspace" | "session" | null>(null);

  const listQuery = useQuery({
    queryKey: ["beta-sessions", workspaceId],
    queryFn: () => fetchSessions(workspaceId, true),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/feedback/beta-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          cohortLabel: cohortLabel || undefined,
          assistanceLevel,
        }),
      });
      if (!res.ok) throw new Error("start failed");
      return (await res.json()) as { session: BetaSession };
    },
    onSuccess: ({ session }) => {
      setActiveSession(session);
      setActiveSessionStorage(session.id);
      setStageDrafts(session.operatorNotes ?? {});
      queryClient.invalidateQueries({ queryKey: ["beta-sessions"] });
    },
  });

  const endMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiFetch(`/api/feedback/beta-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("end failed");
      return res.json();
    },
    onSuccess: () => {
      setActiveSession(null);
      setActiveSessionStorage(null);
      queryClient.invalidateQueries({ queryKey: ["beta-sessions"] });
    },
  });

  const notesMutation = useMutation({
    mutationFn: async ({
      sessionId,
      stage,
      note,
    }: {
      sessionId: string;
      stage: BetaRunbookStage;
      note: BetaStageNote;
    }) => {
      const res = await apiFetch(`/api/feedback/beta-sessions/${sessionId}/notes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stages: { [stage]: note } }),
      });
      if (!res.ok) throw new Error("notes failed");
      return (await res.json()) as { session: BetaSession };
    },
    onSuccess: ({ session }) => {
      setActiveSession(session);
      setStageDrafts(session.operatorNotes ?? {});
    },
  });

  const resolvedSession = useMemo(() => {
    if (activeSession) return activeSession;
    const sessions = listQuery.data?.sessions ?? [];
    return sessions[0] ?? null;
  }, [activeSession, listQuery.data?.sessions]);

  if (listQuery.error instanceof Error && listQuery.error.message === "forbidden") {
    return null;
  }

  const saveStage = (stage: BetaRunbookStage, markComplete: boolean) => {
    if (!resolvedSession) return;
    const draft = stageDrafts[stage] ?? {};
    const note: BetaStageNote = {
      ...draft,
      completedAt: markComplete
        ? draft.completedAt ?? new Date().toISOString()
        : undefined,
    };
    notesMutation.mutate({ sessionId: resolvedSession.id, stage, note });
  };

  return (
    <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Beta Sessions</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Run operator-guided sessions with runbook stage notes. Events attach via session ID.
        </p>
      </div>

      {!resolvedSession ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-[var(--text-primary)]">Target workspace ID</span>
            <input
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="uuid"
              className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--text-primary)]">Cohort label (optional)</span>
            <input
              value={cohortLabel}
              onChange={(e) => setCohortLabel(e.target.value)}
              className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--text-primary)]">Assistance level</span>
            <select
              value={assistanceLevel}
              onChange={(e) => setAssistanceLevel(e.target.value as BetaAssistanceLevel)}
              className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
            >
              <option value="hands_on">Hands on</option>
              <option value="observe_only">Observe only</option>
            </select>
          </label>
          <Button
            type="button"
            disabled={!workspaceId || startMutation.isPending}
            onClick={() => startMutation.mutate()}
            className="sm:col-span-2"
          >
            Start session
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>Workspace: {resolvedSession.workspaceId}</span>
            <CopyIdButton
              label="Copy workspace ID"
              copied={copiedField === "workspace"}
              onCopy={() => {
                void copyToClipboard(resolvedSession.workspaceId).then(() => {
                  setCopiedField("workspace");
                  window.setTimeout(() => setCopiedField(null), 2000);
                });
              }}
            />
            <span>Session: {resolvedSession.id}</span>
            <CopyIdButton
              label="Copy session ID"
              copied={copiedField === "session"}
              onCopy={() => {
                void copyToClipboard(resolvedSession.id).then(() => {
                  setCopiedField("session");
                  window.setTimeout(() => setCopiedField(null), 2000);
                });
              }}
            />
            <span>
              Started {new Date(resolvedSession.startedAt).toLocaleString()}
            </span>
          </div>

          <div className="space-y-3">
            {BETA_RUNBOOK_STAGES.map((stage) => {
              const draft = stageDrafts[stage] ?? resolvedSession.operatorNotes?.[stage] ?? {};
              const completed = Boolean(draft.completedAt);

              return (
                <div
                  key={stage}
                  className={cn(
                    "rounded-lg border p-4 space-y-2",
                    completed
                      ? "border-[var(--accent-green)]/30 bg-[var(--accent-green)]/5"
                      : "border-[var(--border-dim)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">
                      {STAGE_LABELS[stage]}
                    </h3>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={completed}
                        onChange={(e) => {
                          const next = {
                            ...draft,
                            completedAt: e.target.checked
                              ? new Date().toISOString()
                              : undefined,
                          };
                          setStageDrafts((prev) => ({ ...prev, [stage]: next }));
                          if (e.target.checked) {
                            saveStage(stage, true);
                          }
                        }}
                      />
                      Complete
                    </label>
                  </div>
                  <textarea
                    value={draft.notes ?? ""}
                    onChange={(e) =>
                      setStageDrafts((prev) => ({
                        ...prev,
                        [stage]: { ...draft, notes: e.target.value },
                      }))
                    }
                    rows={2}
                    placeholder="Operator notes for this stage"
                    className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                  />
                  <input
                    value={(draft.tags ?? []).join(", ")}
                    onChange={(e) =>
                      setStageDrafts((prev) => ({
                        ...prev,
                        [stage]: {
                          ...draft,
                          tags: e.target.value
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean),
                        },
                      }))
                    }
                    placeholder="Tags (comma-separated)"
                    className="w-full h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={notesMutation.isPending}
                    onClick={() => saveStage(stage, completed)}
                  >
                    Save stage notes
                  </Button>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="destructive"
            disabled={endMutation.isPending}
            onClick={() => endMutation.mutate(resolvedSession.id)}
          >
            End session
          </Button>
        </div>
      )}
    </section>
  );
}
