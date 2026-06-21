"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { billingPlanKeys } from "@/server/billing/plans";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { AdminWorkspaceDetail } from "@/server/repositories/admin-workspaces";

type WorkspaceDetailPanelProps = {
  workspaceId: string;
};

type WorkspaceAction = "adjust_credits" | "override_plan";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function WorkspaceDetailPanel({ workspaceId }: WorkspaceDetailPanelProps) {
  const t = useTranslations("admin.workspaces.detail");
  const tActions = useTranslations("admin.workspaces.actions");
  const tShared = useTranslations("admin.actions");
  const queryClient = useQueryClient();

  const [openAction, setOpenAction] = useState<WorkspaceAction | null>(null);
  const [reason, setReason] = useState("");
  const [creditDelta, setCreditDelta] = useState("0");
  const [planKey, setPlanKey] = useState<(typeof billingPlanKeys)[number]>("starter");

  const detailQuery = useQuery({
    queryKey: ["admin", "workspaces", workspaceId, "detail"],
    queryFn: async (): Promise<AdminWorkspaceDetail> => {
      const res = await apiFetch(`/api/admin/workspaces/${workspaceId}`);
      if (!res.ok) {
        throw new Error("Failed to load workspace detail");
      }
      return res.json();
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (action: WorkspaceAction) => {
      const body =
        action === "adjust_credits"
          ? {
              action,
              delta: Number.parseInt(creditDelta, 10),
              reason: reason.trim(),
            }
          : {
              action,
              planKey,
              reason: reason.trim(),
            };

      const res = await apiFetch(`/api/admin/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(tShared("error"));
      }
    },
    onSuccess: () => {
      toast.success(tShared("success"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "workspaces", workspaceId] });
      setOpenAction(null);
      setReason("");
      setCreditDelta("0");
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

  if (detailQuery.isLoading) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("error")}</p>;
  }

  const detail = detailQuery.data;
  const parsedDelta = Number.parseInt(creditDelta, 10);
  const canSubmitCredits =
    reason.trim().length > 0 &&
    Number.isInteger(parsedDelta) &&
    parsedDelta !== 0 &&
    !actionMutation.isPending;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("workspace.title")}</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--text-muted)]">{t("workspace.name")}</dt>
            <dd className="font-medium text-[var(--text-primary)]">{detail.workspace.name}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("workspace.slug")}</dt>
            <dd className="text-[var(--text-primary)]">{detail.workspace.slug}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("workspace.campaigns")}</dt>
            <dd className="text-[var(--text-primary)]">{detail.campaignCount}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("workspace.created")}</dt>
            <dd className="text-[var(--text-primary)]">{formatDate(detail.workspace.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("billing.title")}</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--text-muted)]">{t("billing.plan")}</dt>
            <dd className="text-[var(--text-primary)]">{detail.billing.planKey ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("billing.credits")}</dt>
            <dd className="text-[var(--text-primary)]">{detail.billing.creditBalance}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("billing.remainingAds")}</dt>
            <dd className="text-[var(--text-primary)]">
              {detail.billing.remainingAds ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("billing.status")}</dt>
            <dd className="text-[var(--text-primary)]">{detail.billing.label}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("members.title")}</h2>
        {detail.members.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("members.empty")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("members.columns.name")}</TableHead>
                <TableHead>{t("members.columns.email")}</TableHead>
                <TableHead>{t("members.columns.role")}</TableHead>
                <TableHead>{t("members.columns.joined")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <Link
                      href={`/admin/users/${member.userId}`}
                      className="text-[var(--accent-green)] hover:underline"
                    >
                      {member.name}
                    </Link>
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.role}</TableCell>
                  <TableCell>{formatDate(member.joinedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("creditHistory.title")}
        </h2>
        {detail.creditTransactions.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("creditHistory.empty")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("creditHistory.columns.type")}</TableHead>
                <TableHead>{t("creditHistory.columns.amount")}</TableHead>
                <TableHead>{t("creditHistory.columns.description")}</TableHead>
                <TableHead>{t("creditHistory.columns.campaign")}</TableHead>
                <TableHead>{t("creditHistory.columns.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.creditTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>{transaction.type}</TableCell>
                  <TableCell>{transaction.amount}</TableCell>
                  <TableCell>{transaction.description ?? "—"}</TableCell>
                  <TableCell>{transaction.campaignName ?? "—"}</TableCell>
                  <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tActions("title")}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{tActions("description")}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setReason("");
              setCreditDelta("0");
              setOpenAction("adjust_credits");
            }}
          >
            {tActions("buttons.adjust_credits")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setReason("");
              setPlanKey("starter");
              setOpenAction("override_plan");
            }}
          >
            {tActions("buttons.override_plan")}
          </Button>
        </div>

        <Dialog open={openAction !== null} onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent
            size="sm"
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]"
          >
            <DialogHeader>
              <DialogTitle>
                {openAction ? tActions(`confirm.${openAction}.title`) : tActions("title")}
              </DialogTitle>
              <DialogDescription className="text-[var(--text-secondary)]">
                {openAction ? tActions(`confirm.${openAction}.description`) : ""}
              </DialogDescription>
            </DialogHeader>

            {openAction === "adjust_credits" ? (
              <div className="space-y-2">
                <Label htmlFor="admin-workspace-credit-delta">{tActions("fields.delta")}</Label>
                <Input
                  id="admin-workspace-credit-delta"
                  type="number"
                  value={creditDelta}
                  onChange={(event) => setCreditDelta(event.target.value)}
                  placeholder={tActions("fields.deltaPlaceholder")}
                />
                <p className="text-xs text-[var(--text-muted)]">{tActions("fields.deltaHint")}</p>
              </div>
            ) : null}

            {openAction === "override_plan" ? (
              <div className="space-y-2">
                <Label htmlFor="admin-workspace-plan-key">{tActions("fields.planKey")}</Label>
                <Select
                  value={planKey}
                  onValueChange={(value) =>
                    setPlanKey(value as (typeof billingPlanKeys)[number])
                  }
                >
                  <SelectTrigger id="admin-workspace-plan-key">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {billingPlanKeys.map((key) => (
                      <SelectItem key={key} value={key}>
                        {key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="admin-workspace-action-reason">{tShared("reasonLabel")}</Label>
              <Textarea
                id="admin-workspace-action-reason"
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
                disabled={
                  !openAction ||
                  actionMutation.isPending ||
                  !reason.trim() ||
                  (openAction === "adjust_credits" && !canSubmitCredits)
                }
                onClick={() => openAction && actionMutation.mutate(openAction)}
              >
                {actionMutation.isPending ? tShared("submitting") : tShared("confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}
