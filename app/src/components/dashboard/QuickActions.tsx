"use client";
import { Zap, Upload, BookOpen, Users } from "lucide-react";
import Link from "next/link";

const actions = [
  { icon: Zap, label: "Restyling", href: "/restyling" },
  { icon: Upload, label: "Upload", href: "/campaigns/new" },
  { icon: BookOpen, label: "Biblioteca", href: "/library" },
  { icon: Users, label: "Equipe", href: "/settings?tab=team" },
];

export default function QuickActions() {
  return (
    <div className="flex gap-3">
      {actions.map(({ icon: Icon, label, href }) => (
        <Link key={label} href={href}
          className="flex items-center gap-2 px-5 py-2.5 text-sm text-[var(--text-secondary)] bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-md transition-colors duration-200 hover:border-[var(--accent-green)] hover:bg-[var(--accent-green-dim)]">
          <Icon size={16} strokeWidth={1.5} />{label}
        </Link>
      ))}
    </div>
  );
}
