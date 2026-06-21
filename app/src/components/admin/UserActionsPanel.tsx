"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminUserAction } from "@/server/repositories/admin-users";

type UserActionsPanelProps = {
  userId: string;
};

const ACTIONS: AdminUserAction[] = [
  "verify_email",
  "reset_onboarding",
  "unlock_trial_notifications",
];

export default function UserActionsPanel({ userId }: UserActionsPanelProps) {
  const t = useTranslations("admin.users.actions");
  const tShared = useTranslations("admin.actions");
  const queryClient = useQueryClient();
  const [openAction, setOpenAction] = useState<AdminUserAction | null>(null);
  const [reason, setReason] = useState("");

  const actionMutation = useMutation({
    mutationFn: async (action: AdminUserAction) => {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });

      if (!res.ok) {
        throw new Error(tShared("error"));
      }
    },
    onSuccess: () => {
      toast.success(tShared("success"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
      setOpenAction(null);
      setReason("");
    },
    onError: () => {
      toast.error(tShared("error"));
    },
  });

  const closeDialog = () => {
    if (actionMutation.isPending) return;
    setOpenAction(null);
    setReason("");
  };

  return (
    <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("description")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <Button
            key={action}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setReason("");
              setOpenAction(action);
            }}
          >
            {t(`buttons.${action}`)}
          </Button>
        ))}
      </div>

      <Dialog open={openAction !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent
          size="sm"
          className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]"
        >
          <DialogHeader>
            <DialogTitle>
              {openAction ? t(`confirm.${openAction}.title`) : t("title")}
            </DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              {openAction ? t(`confirm.${openAction}.description`) : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="admin-user-action-reason">{tShared("reasonLabel")}</Label>
            <Textarea
              id="admin-user-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={tShared("reasonPlaceholder")}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={actionMutation.isPending}
            >
              {tShared("cancel")}
            </Button>
            <Button
              type="button"
              disabled={!reason.trim() || actionMutation.isPending || !openAction}
              onClick={() => openAction && actionMutation.mutate(openAction)}
            >
              {actionMutation.isPending ? tShared("submitting") : tShared("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
