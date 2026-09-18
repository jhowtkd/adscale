import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Adscale — comece sua próxima criação",
  description: "Descreva sua ideia e continue a criação no Estúdio Adscale.",
  alternates: { canonical: "https://adscale.jhonatansoares.com/hi" },
};

/**
 * `/hi` route layout (#439). Deliberately NOT under `(public)/`, whose
 * legal chrome (LegalNav) is wrong for a landing page. Public: no auth
 * check, no fetch of brands/works/campaigns/billing.
 */
export default function HiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
