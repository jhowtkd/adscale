"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const DIAGNOSIS_RATINGS = ["useful", "incomplete", "misleading"] as const;
const PLAN_RATINGS = ["generation_ready", "partially_useful", "unusable"] as const;

export function GuidedFlowFeedbackPanel() {
  const [threadId, setThreadId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [feedbackKind, setFeedbackKind] = useState<
    "diagnosis_utility" | "creative_plan_readiness"
  >("diagnosis_utility");
  const [rating, setRating] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!threadId || !workspaceId || !rating) return;
    setStatus("saving");
    try {
      const res = await apiFetch(
        `/api/assistant/threads/${threadId}/guided-flow/feedback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            feedbackKind,
            rating,
            reasonText: reasonText || null,
          }),
        }
      );
      if (!res.ok) throw new Error("failed");
      setStatus("saved");
      setReasonText("");
    } catch {
      setStatus("error");
    }
  }

  const ratings =
    feedbackKind === "diagnosis_utility" ? DIAGNOSIS_RATINGS : PLAN_RATINGS;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Guided journey quality feedback
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Record read-only operational feedback on diagnosis utility or creative plan readiness.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs sm:col-span-2">
          <span className="font-medium">Workspace ID</span>
          <input
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-xs"
            placeholder="uuid"
            required
          />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          <span className="font-medium">Thread ID</span>
          <input
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-xs"
            placeholder="uuid"
            required
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium">Feedback type</span>
          <select
            value={feedbackKind}
            onChange={(e) => {
              setFeedbackKind(e.target.value as typeof feedbackKind);
              setRating("");
            }}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="diagnosis_utility">Diagnosis utility</option>
            <option value="creative_plan_readiness">Creative plan readiness</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium">Rating</span>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
            required
          >
            <option value="">Select…</option>
            {ratings.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          <span className="font-medium">Reason (optional, max 256)</span>
          <input
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            maxLength={256}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "saving"}
            className="inline-flex h-9 items-center rounded-md bg-[var(--accent-green)] px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            Save feedback
          </button>
          {status === "saved" ? (
            <span className="text-xs text-[var(--accent-green)]">Saved</span>
          ) : null}
          {status === "error" ? (
            <span className="text-xs text-red-500">Could not save feedback</span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
