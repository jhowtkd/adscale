"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-dim)] px-8 py-6 text-center">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          ADScale &copy; 2026
        </p>
        <div className="flex gap-4 text-xs text-[var(--text-muted)]">
          <Link href="/privacy" className="hover:text-[var(--text-primary)] hover:underline">
            Privacidade
          </Link>
          <Link href="/terms" className="hover:text-[var(--text-primary)] hover:underline">
            Termos
          </Link>
        </div>
      </div>
    </footer>
  );
}
