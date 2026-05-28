"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderOpen, LayoutTemplate, Settings, Sparkles, User, X } from "lucide-react";
import { usePrefetchCampaigns } from "@/lib/hooks/use-prefetch";
import { cn } from "@/lib/utils";

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobile, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const { prefetch: prefetchCampaigns } = usePrefetchCampaigns();

  const topNav = [
    { icon: LayoutDashboard, href: "/", label: "Dashboard" },
    { icon: FolderOpen, href: "/campaigns", label: "Campaigns", onHover: prefetchCampaigns },
    { icon: LayoutTemplate, href: "/library", label: "Library" },
    { icon: Sparkles, href: "/restyling", label: "Restyling" },
  ];
  const bottomNav = [
    { icon: Settings, href: "/settings", label: "Settings" },
    { icon: User, href: "/profile", label: "Profile" },
  ];

  if (mobile) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between px-4 border-b border-[#1a1a24]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[4px] bg-[#2fb67d] flex items-center justify-center font-bold text-[#0a0a0f] text-sm">A</div>
            <span className="text-sm font-semibold text-[#b4b4be]">ADScale</span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-[#6e6e7a] hover:text-[#b4b4be] hover:bg-[#1a1a24] transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 flex flex-col gap-1 p-4">
          {topNav.map(({ icon: Icon, href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200",
                isActive(href)
                  ? "text-[#2fb67d] bg-[rgba(47,182,125,0.08)]"
                  : "text-[#b4b4be] hover:bg-[#1a1a24]"
              )}
            >
              <Icon size={20} strokeWidth={1.5} />
              {label}
            </Link>
          ))}
          <div className="my-2 border-t border-[#1a1a24]" />
          {bottomNav.map(({ icon: Icon, href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200",
                isActive(href)
                  ? "text-[#2fb67d] bg-[rgba(47,182,125,0.08)]"
                  : "text-[#b4b4be] hover:bg-[#1a1a24]"
              )}
            >
              <Icon size={20} strokeWidth={1.5} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[#1a1a24] md:flex bg-[#0e0e14]" style={{ width: 64 }}>
      <div className="flex h-14 items-center justify-center">
        <div className="w-8 h-8 rounded-[4px] bg-[#2fb67d] flex items-center justify-center font-bold text-[#0a0a0f] text-sm">A</div>
      </div>
      <nav className="flex-1 flex flex-col items-center gap-2 py-4">
        {topNav.map(({ icon: Icon, href, label, onHover }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            title={label}
            className={`w-10 h-10 rounded-[4px] flex items-center justify-center transition-colors duration-200 ${isActive(href) ? "text-[#2fb67d] bg-[rgba(47,182,125,0.08)]" : "text-[#6e6e7a] hover:bg-[#1a1a24] hover:text-[#b4b4be]"}`}
            onMouseEnter={onHover}
          >
            <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-2 py-4 border-t border-[#1a1a24]">
        {bottomNav.map(({ icon: Icon, href, label }) => (
          <Link key={href} href={href} aria-label={label} title={label} className={`w-10 h-10 rounded-[4px] flex items-center justify-center transition-colors duration-200 ${isActive(href) ? "text-[#2fb67d] bg-[rgba(47,182,125,0.08)]" : "text-[#6e6e7a] hover:bg-[#1a1a24] hover:text-[#b4b4be]"}`}>
            <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </aside>
  );
}
