// Global publication stop banner (#583): the platform-wide state on the
// internal consoles — "Publicações paradas desde … por … — motivo" while
// active — with the operations stop/resume button behind a confirmation
// dialog (reason required both ways). Self-fetching through the shared
// staff-accounts query, so every console shows the same state for one
// cached read; the module refuses non-operations staff with a 403 that
// reads as a plain sentence here.

"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
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
import { cn } from "@/lib/utils";
import {
  STAFF_ROLE_FOR_COMMAND,
  StaffApiError,
  sendStaffCommand,
  staffFetchJson,
} from "./staff-api";
import { staffErrorKey } from "./staff-errors";
import { formatDue } from "./staff-ui";
import type { CrossAccountPipelineView, GlobalStopStateView } from "./types";

export default function GlobalStopBanner() {
  const query = useQuery({
    queryKey: ["equipe-staff-accounts"],
    queryFn: () => staffFetchJson<CrossAccountPipelineView>("/api/equipe/staff/accounts"),
    retry: false,
  });
  const state = query.data?.globalStop;
  // Loading, error and stale shapes belong to the page around the banner.
  if (!state) return null;
  return <GlobalStopBar state={state} />;
}

function GlobalStopBar({ state }: { state: GlobalStopStateView }) {
  const t = useTranslations("equipe.globalStop");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const active = state.active;

  const stoppedText = active
    ? state.stoppedByName
      ? t("stoppedSince", {
          date: formatDue(state.stoppedAt, locale) ?? state.stoppedAt,
          name: state.stoppedByName,
          reason: state.reason,
        })
      : t("stoppedSinceUnknown", {
          date: formatDue(state.stoppedAt, locale) ?? state.stoppedAt,
          reason: state.reason,
        })
    : t("runningLabel");

  return (
    <section
      aria-label={t(active ? "resume" : "stop")}
      data-testid="global-stop-banner"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
        active
          ? "border-[var(--danger-border)] bg-[var(--danger-bg)]"
          : "border-[var(--border-dim)] bg-[var(--surface-raised)]",
      )}
    >
      <p
        data-testid="global-stop-state"
        className={cn(
          "text-sm font-medium",
          active ? "text-[var(--danger-text)]" : "text-[var(--text-secondary)]",
        )}
      >
        {stoppedText}
      </p>
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="global-stop-button"
      >
        {active ? null : <OctagonPause aria-hidden="true" data-icon="inline-start" />}
        {active ? t("resume") : t("stop")}
      </Button>
      <GlobalStopDialog state={state} open={open} onOpenChange={setOpen} />
    </section>
  );
}

function GlobalStopDialog({
  state,
  open,
  onOpenChange,
}: {
  state: GlobalStopStateView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("equipe.globalStop");
  const tErrors = useTranslations("equipe.staffErrors");
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const active = state.active;
  const command = active ? "resume_all_publications" : "stop_all_publications";
  const trimmed = reason.trim();

  const run = async () => {
    if (trimmed.length === 0 || isPending) return;
    setIsPending(true);
    try {
      await sendStaffCommand({
        type: command,
        payload: { reason: trimmed },
        role: STAFF_ROLE_FOR_COMMAND[command] ?? "operations",
      });
      toast.success(active ? t("resumeDone") : t("stopDone"));
      setReason("");
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["equipe-staff-accounts"] });
    } catch (error) {
      toast.error(
        error instanceof StaffApiError && (error.status === 403 || error.code === "forbidden_actor")
          ? t("forbidden")
          : tErrors(staffErrorKey(error)),
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="global-stop-dialog">
        <DialogHeader>
          <DialogTitle>{active ? t("resumeTitle") : t("stopTitle")}</DialogTitle>
          <DialogDescription>{active ? t("resumeExplainer") : t("stopExplainer")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
            rows={2}
            aria-label={t("reasonLabel")}
            data-testid="global-stop-reason"
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
            disabled={trimmed.length === 0 || isPending}
            onClick={() => void run()}
            data-testid="global-stop-confirm"
          >
            {isPending ? t("sending") : active ? t("resumeConfirm") : t("stopConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
