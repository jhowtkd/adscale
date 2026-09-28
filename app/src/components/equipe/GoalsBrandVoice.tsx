"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveEquipeBrandVoice } from "@/lib/equipe/commands";
import type { GoalsDecisionsJson } from "@/lib/equipe/api";
import { ActionError, useDecisionRunner } from "./GoalsActions";
import { shortHash } from "./equipe-format";

// The brand-voice card on Metas (C3a): the client writes how the brand
// should sound, once, and approves it as the voice every front follows.

export function BrandVoiceCard({
  accountId,
  brandVoice,
}: {
  accountId: string;
  brandVoice: GoalsDecisionsJson["brandVoice"];
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  const [voice, setVoice] = useState("");
  return (
    <section aria-label={t("brandVoice")} data-testid="goals-action-brand-voice">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("brandVoice")}</h2>
      <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
        {brandVoice.approved ? (
          <p className="text-xs text-[var(--text-muted)]" data-testid="goals-voice-done">
            {[
              t("voiceApproved"),
              brandVoice.versionHash ? shortHash(brandVoice.versionHash) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : (
          <>
            <p className="text-xs text-[var(--text-secondary)]">{t("voiceExplainer")}</p>
            <Textarea
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              rows={3}
              placeholder={t("voicePlaceholder")}
              aria-label={t("voiceLabel")}
              data-testid="goals-voice-text"
            />
            <ActionError message={error} testId="goals-voice-error" />
            <div>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isPending || voice.trim().length === 0}
                onClick={() =>
                  void run(
                    () => approveEquipeBrandVoice(accountId, { voice: voice.trim() }),
                    t("voiceDone"),
                  )
                }
                data-testid="goals-voice-approve"
              >
                {t("voiceApprove")}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
