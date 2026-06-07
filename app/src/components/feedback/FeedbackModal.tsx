"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  FeedbackCategory,
  FeedbackContextPayload,
  FeedbackSeverity,
  FeedbackType,
} from "@/lib/feedback/types";

type FeedbackModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: FeedbackContextPayload;
  submitting: boolean;
  onSubmit: (input: {
    type: FeedbackType;
    severity: FeedbackSeverity;
    category: FeedbackCategory;
    message: string;
    followUpAllowed: boolean;
  }) => Promise<void>;
};

function getContextDefaults(context: FeedbackContextPayload): {
  type: FeedbackType;
  category: FeedbackCategory;
  message: string;
} {
  if (
    context.prefillType ||
    context.prefillCategory ||
    context.prefillMessage ||
    context.contextKind === "mission_friction"
  ) {
    const frictionMessage = context.frustrationMoment
      ? `Friction during ${context.frustrationMoment.replace(/_/g, " ")}`
      : "";
    return {
      type: context.prefillType ?? "suggestion",
      category:
        context.prefillCategory ??
        (context.contextKind === "mission_friction" ? "billing" : "ui"),
      message: context.prefillMessage ?? frictionMessage,
    };
  }

  if (context.contextKind === "derivation" || context.contextKind === "campaign") {
    return { type: "bug", category: "generation", message: "" };
  }

  return { type: "bug", category: "ui", message: "" };
}

type FeedbackFormProps = {
  context: FeedbackContextPayload;
  submitting: boolean;
  onSubmit: FeedbackModalProps["onSubmit"];
  onOpenChange: (open: boolean) => void;
};

function FeedbackForm({ context, submitting, onSubmit, onOpenChange }: FeedbackFormProps) {
  const t = useTranslations("feedback");
  const defaults = getContextDefaults(context);
  const [type, setType] = useState<FeedbackType>(defaults.type);
  const [severity, setSeverity] = useState<FeedbackSeverity>("medium");
  const [category, setCategory] = useState<FeedbackCategory>(defaults.category);
  const [message, setMessage] = useState(defaults.message);
  const [followUpAllowed, setFollowUpAllowed] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    await onSubmit({
      type,
      severity,
      category,
      message: message.trim(),
      followUpAllowed,
    });
    setMessage("");
    setFollowUpAllowed(false);
  };

  return (
    <>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="feedback-type">{t("type")}</Label>
          <select
            id="feedback-type"
            value={type}
            onChange={(e) => setType(e.target.value as FeedbackType)}
            className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
          >
            <option value="bug">{t("types.bug")}</option>
            <option value="suggestion">{t("types.suggestion")}</option>
            <option value="question">{t("types.question")}</option>
            <option value="other">{t("types.other")}</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="feedback-severity">{t("severity")}</Label>
            <select
              id="feedback-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}
              className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
            >
              <option value="low">{t("severities.low")}</option>
              <option value="medium">{t("severities.medium")}</option>
              <option value="high">{t("severities.high")}</option>
              <option value="critical">{t("severities.critical")}</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="feedback-category">{t("category")}</Label>
            <select
              id="feedback-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
            >
              <option value="ui">{t("categories.ui")}</option>
              <option value="generation">{t("categories.generation")}</option>
              <option value="billing">{t("categories.billing")}</option>
              <option value="performance">{t("categories.performance")}</option>
              <option value="other">{t("categories.other")}</option>
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="feedback-message">{t("message")}</Label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder={t("messagePlaceholder")}
            className="min-h-[120px] rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={followUpAllowed}
            onChange={(e) => setFollowUpAllowed(e.target.checked)}
            className="mt-1"
          />
          {t("followUp")}
        </label>

        {context.route ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t("routeContext", { route: context.route })}
          </p>
        ) : null}

        <p className="text-xs text-[var(--text-muted)]">{t("privacyNote")}</p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !message.trim()}
        >
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </DialogFooter>
    </>
  );
}

export default function FeedbackModal({
  open,
  onOpenChange,
  context,
  submitting,
  onSubmit,
}: FeedbackModalProps) {
  const t = useTranslations("feedback");
  const formKey = [
    context.contextKind ?? "global",
    context.route ?? "",
    context.frustrationMoment ?? "",
  ].join(":");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {open ? (
          <FeedbackForm
            key={formKey}
            context={context}
            submitting={submitting}
            onSubmit={onSubmit}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
