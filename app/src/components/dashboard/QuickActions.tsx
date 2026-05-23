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
    <div className="flex gap-2">
      {actions.map(({ icon: Icon, label, href }) => (
        <Link key={label} href={href}
          className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] text-[#6e6e7a] bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] transition-all hover:border-[#2fb67d] hover:text-[#e8e8ec] hover:bg-[rgba(47,182,125,0.04)]">
          <Icon size={14} strokeWidth={1.5} />{label}
        </Link>
      ))}
    </div>
  );
}
