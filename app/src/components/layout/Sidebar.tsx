"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderOpen, LayoutTemplate, Settings, Sparkles, User } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  const topNav = [
    { icon: LayoutDashboard, href: "/" },
    { icon: FolderOpen, href: "/campaigns" },
    { icon: LayoutTemplate, href: "/library" },
    { icon: Sparkles, href: "/restyling" },
  ];
  const bottomNav = [
    { icon: Settings, href: "/settings" },
    { icon: User, href: "/profile" },
  ];

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[#1a1a24] md:flex bg-[#0e0e14]" style={{ width: 64 }}>
      <div className="flex h-14 items-center justify-center">
        <div className="w-8 h-8 rounded-[4px] bg-[#2fb67d] flex items-center justify-center font-bold text-[#0a0a0f] text-sm">A</div>
      </div>
      <nav className="flex-1 flex flex-col items-center gap-2 py-4">
        {topNav.map(({ icon: Icon, href }) => (
          <Link key={href} href={href} className={`w-10 h-10 rounded-[4px] flex items-center justify-center transition-colors duration-200 ${isActive(href) ? "text-[#2fb67d] bg-[rgba(47,182,125,0.08)]" : "text-[#6e6e7a] hover:bg-[#1a1a24] hover:text-[#b4b4be]"}`}>
            <Icon size={24} strokeWidth={1.5} />
          </Link>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-2 py-4 border-t border-[#1a1a24]">
        {bottomNav.map(({ icon: Icon, href }) => (
          <Link key={href} href={href} className={`w-10 h-10 rounded-[4px] flex items-center justify-center transition-colors duration-200 ${isActive(href) ? "text-[#2fb67d] bg-[rgba(47,182,125,0.08)]" : "text-[#6e6e7a] hover:bg-[#1a1a24] hover:text-[#b4b4be]"}`}>
            <Icon size={24} strokeWidth={1.5} />
          </Link>
        ))}
      </div>
    </aside>
  );
}
