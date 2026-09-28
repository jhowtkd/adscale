"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { OctagonPause } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  EquipeCommandError,
  pauseEquipePublications,
  requestEquipeSupport,
  resumeEquipePause,
} from "@/lib/equipe/commands";
import { useEquipeAccountState, useInvalidateEquipe } from "@/lib/equipe/use-equipe";
import EquipeViewSelector from "./EquipeViewSelector";

// Header actions shared by the client screens: the Painel|Pipeline selector,
// "Pausar publicações" (client pause command, or "Retomar publicações" while
// the client's own pause is active) and "Falar com uma pessoa"
// (request_support). The dialogs explain what each one does before anything
// is sent; the module decides who may resume, and a 403 says so plainly.

function useCommandRunner(accountId: string | null) {
  const t = useTranslations("equipe.topActions");
  const invalidate = useInvalidateEquipe(accountId);
  const [isPending, setIsPending] = useState(false);
  const run = async (kind: "pause" | "support", note: string): Promise<boolean> => {
    if (!accountId || isPending) return false;
    setIsPending(true);
    try {
      if (kind === "pause") {
        await pauseEquipePublications(accountId, { reason: note });
      } else {
        await requestEquipeSupport(accountId, { note });
      }
      toast.success(kind === "pause" ? t("pauseDone") : t("supportDone"));
      invalidate();
      return true;
    } catch {
      toast.error(t("commandError"));
      return false;
    } finally {
      setIsPending(false);
    }
  };
  return { isPending, run };
}

export function PausePublicationsButton({ accountId }: { accountId: string | null }) {
  const t = useTranslations("equipe.topActions");
  const { isPending, run } = useCommandRunner(accountId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const ready = Boolean(accountId);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready || isPending}
        onClick={() => setOpen(true)}
        data-testid="equipe-pause-button"
      >
        <OctagonPause aria-hidden="true" data-icon="inline-start" />
        {t("pause")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="equipe-pause-dialog">
          <DialogHeader>
            <DialogTitle>{t("pauseTitle")}</DialogTitle>
            <DialogDescription>{t("pauseExplainer")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("reasonOptional")}
              rows={2}
              aria-label={t("reasonOptional")}
              data-testid="equipe-pause-reason"
            />
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" size="sm" />}>
              {t("cancel")}
            </DialogClose>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() =>
                void run("pause", reason).then((sent) => {
                  if (sent) {
                    setOpen(false);
                    setReason("");
                  }
                })
              }
              data-testid="equipe-pause-confirm"
            >
              {isPending ? t("sending") : t("pauseConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ResumePublicationsButton({
  accountId,
  pauseId,
}: {
  accountId: string | null;
  pauseId: string;
}) {
  const t = useTranslations("equipe.topActions");
  const invalidate = useInvalidateEquipe(accountId);
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const ready = Boolean(accountId);

  const run = async () => {
    if (!accountId || isPending) return;
    setIsPending(true);
    try {
      await resumeEquipePause(accountId, { pauseId });
      toast.success(t("resumeDone"));
      setOpen(false);
      invalidate();
    } catch (error) {
      toast.error(
        error instanceof EquipeCommandError && error.status === 403
          ? t("resumeForbidden")
          : t("commandError"),
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready || isPending}
        onClick={() => setOpen(true)}
        data-testid="equipe-resume-button"
      >
        {t("resume")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="equipe-resume-dialog">
          <DialogHeader>
            <DialogTitle>{t("resumeTitle")}</DialogTitle>
            <DialogDescription>{t("resumeExplainer")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" size="sm" />}>
              {t("cancel")}
            </DialogClose>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() => void run()}
              data-testid="equipe-resume-confirm"
            >
              {isPending ? t("sending") : t("resumeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PauseOrResume({ accountId }: { accountId: string | null }) {
  const { data } = useEquipeAccountState(accountId);
  const clientPause = data?.activePauses?.find(
    (pause) => pause.origin === "client" && pause.status === "active",
  );
  if (clientPause) {
    return <ResumePublicationsButton accountId={accountId} pauseId={clientPause.id} />;
  }
  return <PausePublicationsButton accountId={accountId} />;
}

export function RequestSupportButton({ accountId }: { accountId: string | null }) {
  const t = useTranslations("equipe.topActions");
  const { isPending, run } = useCommandRunner(accountId);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const ready = Boolean(accountId);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!ready || isPending}
        onClick={() => setOpen(true)}
        data-testid="equipe-support-button"
      >
        {t("support")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="equipe-support-dialog">
          <DialogHeader>
            <DialogTitle>{t("supportTitle")}</DialogTitle>
            <DialogDescription>{t("supportExplainer")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("noteOptional")}
              rows={2}
              aria-label={t("noteOptional")}
              data-testid="equipe-support-note"
            />
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" size="sm" />}>
              {t("cancel")}
            </DialogClose>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() =>
                void run("support", note).then((sent) => {
                  if (sent) {
                    setOpen(false);
                    setNote("");
                  }
                })
              }
              data-testid="equipe-support-confirm"
            >
              {isPending ? t("sending") : t("supportConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function EquipeTopActions({
  active,
  accountId,
}: {
  active: "painel" | "pipeline";
  accountId: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="equipe-top-actions">
      <EquipeViewSelector active={active} />
      <PauseOrResume accountId={accountId} />
      <RequestSupportButton accountId={accountId} />
    </div>
  );
}
