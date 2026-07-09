"use client";

import { useState, useMemo } from "react";
import { m, useReducedMotion } from "framer-motion";
import { UserPlus, Edit, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  useWorkspaceMembers,
  useRemoveMember,
  useInviteMember,
} from "@/lib/hooks/use-workspace-team";

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

const roleConfig: Record<
  TeamMember["role"],
  { color: string; bg: string }
> = {
  Owner: { color: "var(--warning-text)", bg: "var(--warning-bg)" },
  Admin: { color: "var(--info-text)", bg: "var(--info-bg)" },
  Editor: { color: "var(--accent-green)", bg: "var(--accent-green-dim)" },
  Viewer: { color: "var(--neutral-text)", bg: "var(--neutral-bg)" },
};

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
      <m.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {t("teamMembers")}
          </h3>
          <span className="text-xs text-[var(--text-muted)]">
            {t("membersCount", { count: members.length })}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const el = document.getElementById("invite-section");
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          <UserPlus size={16} aria-hidden="true" />
          <span>{t("invite")}</span>
        </Button>
      </m.div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3 px-4 rounded-lg bg-[var(--surface-base)] border border-[var(--border-dim)]"
            >
              <Skeleton className="size-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <m.div
          variants={itemVariants}
          className="rounded-lg border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/10 px-4 py-3 text-sm text-[var(--accent-rose)]"
        >
          {error?.message || tc("error")}
        </m.div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && members.length === 0 && (
        <EmptyState
          icon={Users}
          title={t("team.emptyTitle")}
          description={t("team.emptyDescription")}
          action={{
            label: t("invite"),
            icon: UserPlus,
            onClick: () => {
              const el = document.getElementById("invite-section");
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            },
          }}
        />
      )}

      {/* Members List */}
      {!isLoading && !isError && members.length > 0 && (
        <div className="space-y-2">
          {members.map((member, index) => (
            <m.div
              key={member.id}
              variants={itemVariants}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              className={cn(
                "flex items-center gap-4 py-3 px-4 rounded-lg",
                "bg-[var(--surface-base)] border border-[var(--border-dim)]",
                "hover:border-[var(--border-medium)] transition-all duration-200"
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "size-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0",
                  member.status === "Pending"
                    ? "bg-[var(--border-dim)] text-[var(--text-muted)]"
                    : "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
                )}
              >
                {getInitials(member.name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {member.name}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {member.email}
                </p>
              </div>

              {/* Role Badge */}
              <span
                className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                style={{
                  color: roleConfig[member.role].color,
                  backgroundColor: roleConfig[member.role].bg,
                }}
              >
                {t(roleKeyMap[member.role])}
              </span>

              {/* Status */}
              <span
                className={cn(
                  "text-xs flex-shrink-0",
                  member.status === "Active"
                    ? "text-[var(--accent-teal)]"
                    : "text-[var(--text-muted)]"
                )}
              >
                {member.status === "Active" ? t("team.statusActive") : t("team.statusPending")}
              </span>

              {/* Actions */}
              {member.role !== "Owner" && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button"
                    onClick={() => addToast("info", tc("roleManagementComingSoon"))}
                    aria-label={t("team.editRole")}
                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all"
                  >
                    <Edit size={14} />
                  </button>
                  <button type="button"
                    onClick={() => handleRemove(member)}
                    disabled={removeMember.isPending}
                    aria-label={t("team.removeMember")}
                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:bg-[var(--surface-raised)] transition-all disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </m.div>
          ))}
        </div>
      )}

      {/* Invite Section */}
      <m.div
        id="invite-section"
        variants={itemVariants}
        className={cn(
          "rounded-xl p-6 border border-[var(--border-dim)]",
          "bg-[var(--surface-base)]"
        )}
      >
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">
          {t("inviteTeamMembers")}
        </h3>
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
              className={cn(
                "w-full h-10 rounded-md border px-3 text-sm",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
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
              className={cn(
                "h-10 w-full rounded-md border px-3 text-sm sm:w-auto",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)]",
                "transition-all duration-200 border-[var(--border-dim)]",
                "appearance-none cursor-pointer"
              )}
            >
              <option value="Editor">{t("roleEditor")}</option>
              <option value="Admin">{t("roleAdmin")}</option>
              <option value="Viewer">{t("roleViewer")}</option>
            </select>
          </div>
          <button type="button"
            onClick={handleSendInvite}
            disabled={inviteMember.isPending}
            className={cn(
              "h-10 px-4 rounded-md text-sm font-medium text-[var(--text-on-accent)]",
              "bg-[var(--accent-green)] hover:bg-[var(--accent-green-light)]",
              "active:scale-[0.98]",
              "transition-all duration-200",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            {inviteMember.isPending ? tc("sending") : t("sendInvite")}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {t("inviteEmailNote")}
        </p>
      </m.div>

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
