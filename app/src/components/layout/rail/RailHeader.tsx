"use client";

// Top-right of every screen of the rail shell: the Painel | Pipeline selector and the notifications bell.
// Fixed on desktop; on mobile it is the top bar. Each page owns its own label (the mono caps on the left).

import { usePathname } from "next/navigation";
import EquipeViewSelector from "@/components/equipe/EquipeViewSelector";
import { NotificationMenu } from "@/components/layout/TopBar";
import { useActiveBrand } from "@/lib/brands/active-brand-context";
import { defaultEquipeAccountId, useEquipeAccounts } from "@/lib/equipe/use-equipe";
import BrandSwitcher from "./BrandSwitcher";
import { viewFor } from "./rail-nav";

export default function RailHeader() {
  const pathname = usePathname();
  const accounts = useEquipeAccounts();
  const list = accounts.data?.accounts ?? [];
  const brand = useActiveBrand();
  const accountId = defaultEquipeAccountId(list, brand);
  return (
    <header className="rail-shell-header" data-testid="rail-header">
      <div className="md:hidden"><BrandSwitcher menuSide="bottom" /></div>
      <EquipeViewSelector active={viewFor(pathname)} accountId={accountId} />
      <NotificationMenu />
    </header>
  );
}
