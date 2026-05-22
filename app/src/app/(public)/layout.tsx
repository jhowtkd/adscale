import Link from "next/link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--deep-bg)]">
      <header className="border-b border-[var(--border-dim)] bg-[var(--surface-base)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
          <Link href="/" className="text-lg font-bold text-[var(--accent-mint)]">
            ADScale
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-[var(--border-dim)] bg-[var(--surface-base)] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-6 text-xs text-[var(--text-secondary)] sm:flex-row sm:justify-between">
          <span>© 2026 ADScale. Todos os direitos reservados.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-[var(--text-primary)] hover:underline">
              Privacidade
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)] hover:underline">
              Termos
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
