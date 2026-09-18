import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ADScale — Crie peças que convertem",
  description:
    "Descreva seu pedido e leve para o Estúdio ADScale: peças, variações e adaptações de formato.",
};

/**
 * `/hi` route shell (#439). Own minimal layout — deliberately NOT under
 * `(public)/`, whose legal chrome (LegalNav) is wrong for a landing page.
 * Public: no auth check, no fetch of brands/works/campaigns/billing.
 */
export default function HiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
