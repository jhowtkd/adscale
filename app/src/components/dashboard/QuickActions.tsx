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
          className="flex items-center gap-2 px-5 py-2.5 text-sm text-[#b4b4be] bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] transition-colors duration-200 hover:border-[#2fb67d] hover:bg-[rgba(47,182,125,0.06)]">
          <Icon size={16} strokeWidth={1.5} />{label}
        </Link>
      ))}
    </div>
  );
}
