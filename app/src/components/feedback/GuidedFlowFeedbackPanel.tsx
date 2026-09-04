"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { ownerButtonClass } from "./owner-chrome";

const DIAGNOSIS_RATINGS = ["useful", "incomplete", "misleading"] as const;
const PLAN_RATINGS = ["generation_ready", "partially_useful", "unusable"] as const;

export function GuidedFlowFeedbackPanel() {
  const t = useTranslations("feedback.guidedFlowQuality");
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
        },
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
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        <p className="text-sm text-[var(--text-secondary)]">{t("description")}</p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs sm:col-span-2">
          <span className="font-medium">{t("workspaceId")}</span>
          <input
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-xs"
            placeholder="uuid"
            required
          />
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          <span className="font-medium">{t("threadId")}</span>
          <input
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 font-mono text-xs"
            placeholder="uuid"
            required
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium">{t("feedbackType")}</span>
          <select
            value={feedbackKind}
            onChange={(e) => {
              setFeedbackKind(e.target.value as typeof feedbackKind);
              setRating("");
            }}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="diagnosis_utility">{t("types.diagnosis_utility")}</option>
            <option value="creative_plan_readiness">{t("types.creative_plan_readiness")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium">{t("rating")}</span>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
            required
          >
            <option value="">{t("select")}</option>
            {ratings.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          <span className="font-medium">{t("reason")}</span>
          <input
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            maxLength={256}
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={status === "saving"}
            className={ownerButtonClass}
          >
            {t("submit")}
          </button>
          {status === "saved" ? (
            <span className="text-xs text-[var(--success-text)]">{t("saved")}</span>
          ) : null}
          {status === "error" ? (
            <span className="text-xs text-[var(--danger-text)]" role="alert">
              {t("saveError")}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
