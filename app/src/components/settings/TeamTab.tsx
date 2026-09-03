"use client";

import { useState, useMemo } from "react";
import { m, useReducedMotion } from "@/components/animations/MotionBoundary";
import { Edit, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  useWorkspaceMembers,
  useRemoveMember,
  useInviteMember,
} from "@/lib/hooks/use-workspace-team";
import {
  settingsButtonClass,
  settingsFieldClass,
  settingsHintClass,
  settingsRowClass,
  settingsSectionTitleClass,
} from "@/components/settings/settings-chrome";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ============================================
// Team Tab
// ============================================

interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  status: "Active" | "Pending";
}

const roleKeyMap: Record<TeamMember["role"], string> = {
  Owner: "roleOwner",
  Admin: "roleAdmin",
  Editor: "roleEditor",
  Viewer: "roleViewer",
};

/** Map API roles (`owner`/`admin`/`member`) onto the display labels TeamTab uses. */
function toDisplayRole(apiRole: string): TeamMember["role"] {
  switch (apiRole) {
    case "owner":
    case "Owner":
      return "Owner";
    case "admin":
    case "Admin":
      return "Admin";
    case "member":
    case "Editor":
      return "Editor";
    case "Viewer":
      return "Viewer";
    default:
      return "Viewer";
  }
}

function toApiInviteRole(
  displayRole: "Admin" | "Editor" | "Viewer",
): "admin" | "member" {
  return displayRole === "Admin" ? "admin" : "member";
}

function getInitials(name: string): string {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0).toUpperCase() +
    parts[parts.length - 1].charAt(0).toUpperCase()
  );
}

export default function TeamTab() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const reducedMotion = useReducedMotion();

  const { data: membersData, isLoading, isError, error } = useWorkspaceMembers();
  const removeMember = useRemoveMember();
  const inviteMember = useInviteMember();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"Editor" | "Admin" | "Viewer">("Editor");
  const [memberPendingRemoval, setMemberPendingRemoval] = useState<TeamMember | null>(null);

  const members: TeamMember[] = useMemo(() => {
    if (!membersData) return [];
    return membersData.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: toDisplayRole(m.role),
      status: "Active" as const,
    }));
  }, [membersData]);

  const handleSendInvite = () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      addToast("error", tc("invalidEmail"));
      return;
    }
    inviteMember.mutate(
      { email: inviteEmail.trim(), role: toApiInviteRole(inviteRole) },
      {
        onSuccess: () => {
          addToast("success", tc("inviteSent"));
          setInviteEmail("");
          setInviteRole("Editor");
        },
        onError: (err) => {
          addToast("error", err.message || tc("error"));
        },
      }
    );
  };

  const handleRemove = (member: TeamMember) => {
    if (member.role === "Owner") return;
    setMemberPendingRemoval(member);
  };

  const confirmRemove = async () => {
    if (!memberPendingRemoval) return;
    try {
      await removeMember.mutateAsync(memberPendingRemoval.userId);
      addToast("success", tc("memberRemoved"));
      setMemberPendingRemoval(null);
    } catch (err) {
      addToast("error", (err as Error).message || tc("error"));
      throw err;
    }
  };

  return (
    <m.div
      variants={containerVariants}
      initial={reducedMotion ? false : "hidden"}
      animate="show"
      className="max-w-[720px] space-y-8"
    >
      {/* Header */}
      <m.div variants={itemVariants} className="space-y-3">
        <h3 className={settingsSectionTitleClass}>{t("inviteTeamMembers")}</h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label htmlFor="invite-email" className="sr-only">
              {t("emailAddress")}
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t("team.invitePlaceholder")}
              className={settingsFieldClass}
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="sr-only">
              {t("team.roleLabel")}
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "Editor" | "Admin" | "Viewer")}
              className={cn(settingsFieldClass, "appearance-none cursor-pointer sm:w-auto")}
            >
              <option value="Editor">{t("roleEditor")}</option>
              <option value="Admin">{t("roleAdmin")}</option>
              <option value="Viewer">{t("roleViewer")}</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleSendInvite}
            disabled={inviteMember.isPending}
            className={settingsButtonClass}
          >
            {inviteMember.isPending ? tc("sending") : t("sendInvite")}
          </button>
        </div>
        <p className={settingsHintClass}>{t("inviteEmailNote")}</p>
      </m.div>

      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className={settingsSectionTitleClass}>{t("teamMembers")}</h3>
          <span className={settingsHintClass}>
            {t("membersCount", { count: members.length })}
          </span>
        </div>

      {isLoading && (
        <div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={settingsRowClass}>
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <p className="py-4 text-sm text-[var(--danger-text)]">
          {error?.message || tc("error")}
        </p>
      )}

      {!isLoading && !isError && members.length === 0 && (
        <p className="py-6 text-sm text-[var(--text-muted)]">{t("team.emptyDescription")}</p>
      )}

      {!isLoading && !isError && members.length > 0 && (
        <div>
          {members.map((member, index) => (
            <m.div
              key={member.id}
              variants={itemVariants}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              className={settingsRowClass}
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  member.status === "Pending"
                    ? "bg-[var(--border-dim)] text-[var(--text-muted)]"
                    : "bg-[var(--neutral-bg)] text-[var(--neutral-text)]"
                )}
              >
                {getInitials(member.name)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {member.name}
                </p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {member.email}
                </p>
              </div>

              <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                {t(roleKeyMap[member.role])}
              </span>

              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                {member.status === "Active" ? t("team.statusActive") : t("team.statusPending")}
              </span>

              {member.role !== "Owner" && (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button"
                    onClick={() => addToast("info", tc("roleManagementComingSoon"))}
                    aria-label={t("team.editRole")}
                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-all hover:bg-white/6 hover:text-[var(--text-primary)]"
                  >
                    <Edit size={14} />
                  </button>
                  <button type="button"
                    onClick={() => handleRemove(member)}
                    disabled={removeMember.isPending}
                    aria-label={t("team.removeMember")}
                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-all hover:bg-white/6 hover:text-[var(--danger-text)] disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </m.div>
          ))}
        </div>
      )}
      </div>

      <ConfirmDialog
        open={memberPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setMemberPendingRemoval(null);
        }}
        title={t("team.removeConfirmTitle")}
        description={
          memberPendingRemoval
            ? t("team.removeConfirmDescription", { name: memberPendingRemoval.name })
            : ""
        }
        confirmLabel={tc("delete")}
        variant="destructive"
        onConfirm={confirmRemove}
        isLoading={removeMember.isPending}
      />
    </m.div>
  );
}
