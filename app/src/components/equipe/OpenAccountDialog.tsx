// "Abrir conta" on the internal accounts console (#582): workspace →
// brand → fronts → people, fed by the server component with the
// open-account candidates (every workspace with brands still without an
// account). Operations staff only — renders nothing otherwise. Submits the existing open_account command as
// operations; the client-side checks mirror the schema but the API stays
// the authority and its errors surface in plain language.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  settingsFieldClass,
  settingsTextareaClass,
} from "@/components/settings/settings-chrome";
import { STAFF_ROLE_FOR_COMMAND, useStaffCommand } from "./staff-api";
import { StaffErrorAlert, shortAccountId } from "./staff-ui";
import type { OpenAccountCandidateView } from "./types";

const FRONT_KEYS = ["social_instagram", "midia_paga"] as const;
type FrontKey = (typeof FRONT_KEYS)[number];

type CandidateMember = OpenAccountCandidateView["members"][number];

function memberLabel(member: CandidateMember): string {
  return member.name?.trim() || member.email?.trim() || member.userId.slice(0, 8);
}

function byMemberLabel(a: CandidateMember, b: CandidateMember): number {
  return memberLabel(a).localeCompare(memberLabel(b));
}

export default function OpenAccountDialog({
  canOpen,
  candidates,
}: {
  canOpen: boolean;
  candidates: OpenAccountCandidateView[];
}) {
  const t = useTranslations("equipe.openAccount");
  const [open, setOpen] = useState(false);
  if (!canOpen) return null;
  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="open-account-trigger"
      >
        {t("trigger")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" data-testid="open-account-dialog">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          {candidates.length === 0 ? (
            <>
              <DialogBody>
                <p className="text-sm text-[var(--text-secondary)]">{t("emptyCandidates")}</p>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  {t("close")}
                </Button>
              </DialogFooter>
            </>
          ) : open ? (
            <OpenAccountForm
              key="open-account-form"
              candidates={candidates}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OpenAccountForm({
  candidates,
  onClose,
}: {
  candidates: OpenAccountCandidateView[];
  onClose: () => void;
}) {
  const t = useTranslations("equipe.openAccount");
  const tFronts = useTranslations("equipe.fronts");
  const router = useRouter();
  const [openedBrandIds, setOpenedBrandIds] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState(() =>
    candidates.length === 1 ? candidates[0]!.workspace.id : "",
  );
  const [brandId, setBrandId] = useState("");
  const [fronts, setFronts] = useState<FrontKey[]>(["social_instagram"]);
  const [approver, setApprover] = useState("");
  const [substitute, setSubstitute] = useState("");
  const [custodian, setCustodian] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ accountId: string; brand: string } | null>(null);
  const command = useStaffCommand<{ accountId: string }>({
    invalidateQueries: [["equipe-staff-accounts"]],
  });
  const busy = command.isPending;

  const candidate = candidates.find((entry) => entry.workspace.id === workspaceId) ?? null;
  const members = candidate ? [...candidate.members].sort(byMemberLabel) : [];
  const brandName = candidate?.brands.find((brand) => brand.id === brandId)?.name ?? null;
  // Candidates are server-rendered: until router.refresh() lands, hide the
  // brands just opened in this dialog so staff cannot resubmit into a 409.
  const visibleBrands = (candidate?.brands ?? []).filter(
    (brand) => !openedBrandIds.includes(brand.id),
  );

  function selectWorkspace(next: string) {
    setWorkspaceId(next);
    setBrandId("");
    setApprover("");
    setSubstitute("");
    setCustodian("");
    setMemberIds([]);
    setInvalid(null);
  }

  function toggleFront(key: FrontKey, checked: boolean) {
    setFronts((current) =>
      checked ? [...current, key].filter((entry, index, all) => all.indexOf(entry) === index) : current.filter((entry) => entry !== key),
    );
  }

  function toggleMember(userId: string, checked: boolean) {
    setMemberIds((current) =>
      checked ? [...current, userId] : current.filter((entry) => entry !== userId),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!candidate) {
      setInvalid("workspaceRequired");
      return;
    }
    if (!brandId) {
      setInvalid("brandRequired");
      return;
    }
    if (fronts.length === 0) {
      setInvalid("frontsRequired");
      return;
    }
    if (!approver) {
      setInvalid("approverRequired");
      return;
    }
    if (substitute && substitute === approver) {
      setInvalid("substituteSameAsApprover");
      return;
    }
    const peopleCount =
      1 + (substitute ? 1 : 0) + (custodian ? 1 : 0) + memberIds.length;
    if (peopleCount > 20) {
      setInvalid("tooManyPeople");
      return;
    }
    if (notes.trim().length > 2000) {
      setInvalid("noteTooLong");
      return;
    }
    setInvalid(null);
    const byId = new Map(candidate.members.map((member) => [member.userId, member]));
    const person = (userId: string, role: string) => {
      const member = byId.get(userId)!;
      return {
        name: memberLabel(member),
        role,
        userId,
        ...(member.email?.trim() ? { email: member.email.trim() } : {}),
      };
    };
    try {
      const data = await command.mutateAsync({
        type: "open_account",
        payload: {
          clientProfileId: brandId,
          fronts,
          people: [
            person(approver, "approver"),
            ...(substitute ? [person(substitute, "substitute")] : []),
            ...(custodian ? [person(custodian, "custodian")] : []),
            ...memberIds.map((userId) => person(userId, "member")),
          ],
          ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
        },
        role: STAFF_ROLE_FOR_COMMAND.open_account,
        workspaceId: candidate.workspace.id,
      });
      setOpenedBrandIds((current) =>
        current.includes(brandId) ? current : [...current, brandId],
      );
      router.refresh();
      setSuccess({ accountId: data.accountId, brand: brandName ?? brandId });
    } catch {
      // Surfaced below through command.error, in plain language.
    }
  }

  if (success) {
    return (
      <>
        <DialogBody>
          <p role="status" className="text-sm text-[var(--text-primary)]">
            <span className="font-medium">{t("successTitle")}</span>
            {" — "}
            {t("successBody", { brand: success.brand, id: shortAccountId(success.accountId) })}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSuccess(null);
              setBrandId("");
              setApprover("");
              setSubstitute("");
              setCustodian("");
              setMemberIds([]);
              setNotes("");
              setInvalid(null);
              command.reset();
            }}
          >
            {t("openAnother")}
          </Button>
          <Button type="button" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <DialogBody className="space-y-4">
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">{t("workspaceLabel")}</span>
          <select
            value={workspaceId}
            onChange={(event) => selectWorkspace(event.target.value)}
            disabled={busy}
            className={settingsFieldClass}
            data-testid="open-account-workspace"
          >
            <option value="">{t("workspacePlaceholder")}</option>
            {candidates.map((entry) => (
              <option key={entry.workspace.id} value={entry.workspace.id}>
                {entry.workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">{t("brandLabel")}</span>
          <select
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            disabled={busy || !candidate}
            className={settingsFieldClass}
            data-testid="open-account-brand"
          >
            <option value="">{t("brandPlaceholder")}</option>
            {visibleBrands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name ?? brand.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        {candidate && visibleBrands.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">{t("noBrands")}</p>
        ) : null}
        <fieldset className="grid gap-1 text-sm">
          <legend className="text-[var(--text-secondary)]">{t("frontsLabel")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {FRONT_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={fronts.includes(key)}
                  onChange={(event) => toggleFront(key, event.target.checked)}
                  disabled={busy}
                />
                {tFronts(key)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">{t("approverLabel")}</span>
            <select
              value={approver}
              onChange={(event) => setApprover(event.target.value)}
              disabled={busy || !candidate}
              className={settingsFieldClass}
              data-testid="open-account-approver"
            >
              <option value="">{t("personPlaceholder")}</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {memberLabel(member)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">{t("substituteLabel")}</span>
            <select
              value={substitute}
              onChange={(event) => setSubstitute(event.target.value)}
              disabled={busy || !candidate}
              className={settingsFieldClass}
              data-testid="open-account-substitute"
            >
              <option value="">{t("noPerson")}</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {memberLabel(member)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">{t("custodianLabel")}</span>
            <select
              value={custodian}
              onChange={(event) => setCustodian(event.target.value)}
              disabled={busy || !candidate}
              className={settingsFieldClass}
              data-testid="open-account-custodian"
            >
              <option value="">{t("noPerson")}</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {memberLabel(member)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="grid gap-1 text-sm">
          <legend className="text-[var(--text-secondary)]">{t("membersLabel")}</legend>
          {members.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{t("noMembers")}</p>
          ) : (
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              {members.map((member) => (
                <label
                  key={member.userId}
                  className="flex items-center gap-2 px-1 py-0.5 text-[var(--text-primary)]"
                >
                  <input
                    type="checkbox"
                    checked={memberIds.includes(member.userId)}
                    onChange={(event) => toggleMember(member.userId, event.target.checked)}
                    disabled={busy}
                  />
                  {memberLabel(member)}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">{t("noteLabel")}</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            disabled={busy}
            className={settingsTextareaClass}
            data-testid="open-account-note"
          />
        </label>
        {invalid ? (
          <p role="alert" className="text-xs text-[var(--danger-text)]">
            {t(invalid)}
          </p>
        ) : null}
        {command.error ? <StaffErrorAlert error={command.error} /> : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {t("close")}
        </Button>
        <Button type="submit" disabled={busy} data-testid="open-account-submit">
          {busy ? t("submitting") : t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
