"use client";

import { motion } from "framer-motion";
import { Users, UserPlus, Shield, Edit, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

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
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  status: "Active" | "Pending";
  initials: string;
}

const members: TeamMember[] = [
  {
    id: "1",
    name: "Alex Johnson",
    email: "alex@company.com",
    role: "Owner",
    status: "Active",
    initials: "AJ",
  },
  {
    id: "2",
    name: "Sarah Chen",
    email: "sarah@company.com",
    role: "Admin",
    status: "Active",
    initials: "SC",
  },
  {
    id: "3",
    name: "Mike Ross",
    email: "mike@company.com",
    role: "Editor",
    status: "Active",
    initials: "MR",
  },
  {
    id: "4",
    name: "Pending invite",
    email: "dev@company.com",
    role: "Editor",
    status: "Pending",
    initials: "?",
  },
];

const roleConfig: Record<
  TeamMember["role"],
  { color: string; bg: string }
> = {
  Owner: { color: "var(--accent-amber)", bg: "rgba(245,158,11,0.12)" },
  Admin: { color: "var(--accent-rose)", bg: "rgba(244,63,94,0.12)" },
  Editor: { color: "var(--accent-blue)", bg: "rgba(99,102,241,0.12)" },
  Viewer: { color: "var(--text-muted)", bg: "rgba(71,85,105,0.12)" },
};

export default function TeamTab() {
  const addToast = useAppStore((s) => s.addToast);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-[720px] space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Team Members
          </h3>
          <span className="text-xs text-[var(--text-muted)]">
            {members.length} members
          </span>
        </div>
        <button
          onClick={() => addToast("info", "Team invites coming soon")}
          className={cn(
            "h-9 px-4 rounded-md text-sm font-medium text-white flex items-center gap-2",
            "bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)]",
            "active:scale-[0.98]",
            "transition-all duration-200"
          )}
        >
          <UserPlus size={16} />
          <span>Invite</span>
        </button>
      </motion.div>

      {/* Members List */}
      <div className="space-y-2">
        {members.map((member, index) => (
          <motion.div
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
                "w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0",
                member.status === "Pending"
                  ? "bg-[var(--border-dim)] text-[var(--text-muted)]"
                  : "bg-[var(--accent-blue-dim)] text-[var(--accent-blue-light)]"
              )}
            >
              {member.initials}
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
              {member.role}
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
              {member.status}
            </span>

            {/* Actions */}
            {member.role !== "Owner" && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => addToast("info", "Role management coming soon")}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)] transition-all"
                >
                  <Edit size={14} />
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Invite Section */}
      <motion.div
        variants={itemVariants}
        className={cn(
          "rounded-xl p-6 border border-[var(--border-dim)]",
          "bg-[var(--surface-base)]"
        )}
      >
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">
          Invite Team Members
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="colleague@company.com"
            className={cn(
              "flex-1 h-10 rounded-md border px-3 text-sm",
              "bg-[var(--surface-base)] text-[var(--text-primary)]",
              "placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
              "transition-all duration-200 border-[var(--border-dim)]"
            )}
          />
          <select
            className={cn(
              "h-10 rounded-md border px-3 text-sm",
              "bg-[var(--surface-base)] text-[var(--text-primary)]",
              "focus:outline-none focus:border-[var(--accent-blue)]",
              "transition-all duration-200 border-[var(--border-dim)]",
              "appearance-none cursor-pointer"
            )}
          >
            <option>Editor</option>
            <option>Admin</option>
            <option>Viewer</option>
          </select>
          <button
            onClick={() => addToast("info", "Invites coming soon")}
            className={cn(
              "h-10 px-4 rounded-md text-sm font-medium text-white",
              "bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)]",
              "active:scale-[0.98]",
              "transition-all duration-200"
            )}
          >
            Send Invite
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Invited members will receive an email with a join link
        </p>
      </motion.div>
    </motion.div>
  );
}
