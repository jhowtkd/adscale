import Image from "next/image";
import Link from "next/link";
import { LegalNav } from "@/components/legal/LegalNav";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="px-6 pt-8 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="inline-flex rounded-md py-0.5" aria-label="ADScale">
            <Image
              src="/images/logo.svg"
              alt=""
              aria-hidden="true"
              className="v6-sidebar-logo block h-[22px] w-auto max-w-[130px]"
              width={813}
              height={142}
              priority
              unoptimized
            />
          </Link>
          <LegalNav />
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-3xl px-6 pb-10 sm:px-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          ADScale © 2026
        </p>
      </footer>
    </div>
  );
}
