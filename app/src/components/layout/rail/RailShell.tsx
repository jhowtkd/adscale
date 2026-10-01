"use client";

// The shell of the Equipe pilot (gate on): the v4 rail replaces the classic sidebar on every dashboard route, the
// header carries Painel | Pipeline and the bell, and the mobile bar leads to Conversa, Criações, Biblioteca and Mais.
// Gate off keeps AppShell / the classic assistant shell untouched.

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Footer from "@/components/layout/Footer";
import V6ShellLayout from "@/components/layout/V6ShellLayout";
import { cn } from "@/lib/utils";
import Rail from "./Rail";
import RailHeader from "./RailHeader";
import RailMobileNav from "./RailMobileNav";
import { railDestinationFor } from "./rail-nav";
import { RailSearchProvider } from "./rail-search";

export default function RailShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The conversation owns the whole column (its own scroll and composer); every other page scrolls with the shell.
  const conversation = railDestinationFor(pathname) === "conversation";
  return (
    <RailSearchProvider>
      <V6ShellLayout sidebar={<Rail />}>
        <RailHeader />
        <main
          id="main"
          className={cn("rail-shell-main", conversation ? "assistant-shell-host flex min-h-0 flex-col" : "shell-offset-bottom-mobile")}
          data-testid="rail-main"
        >
          {conversation ? children : (
            <>
              <div className="relative min-w-0 overflow-x-clip">{children}</div>
              <Footer />
            </>
          )}
        </main>
        <RailMobileNav />
      </V6ShellLayout>
    </RailSearchProvider>
  );
}
