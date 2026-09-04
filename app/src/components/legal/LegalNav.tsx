"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { legalNavClass, legalNavLinkClass } from "./legal-chrome";

export function LegalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentos legais" className={legalNavClass}>
      <Link href="/privacy" className={legalNavLinkClass(pathname.startsWith("/privacy"))}>
        Privacidade
      </Link>
      <Link href="/terms" className={legalNavLinkClass(pathname.startsWith("/terms"))}>
        Termos
      </Link>
    </nav>
  );
}
