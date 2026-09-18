import { HiFallback } from "@/components/hi/HiFallback";
import { HiPageShell } from "@/components/hi/HiPageShell";
import { resolveHiFlags } from "@/server/hi/flags";

/**
 * Public home (#439). Server component switching on the pure `/hi` flags:
 * `HI_PAGE_ENABLED=true` renders the interactive island (owned by #440 —
 * `HiPageShell` is the integration slot and currently renders the fallback);
 * otherwise the local containment fallback. Never redirects to `/`
 * (anti-recursion: the proxy sends unauthenticated `/` here).
 */
export default function HiPage() {
  const { flags } = resolveHiFlags(process.env);
  if (flags.pageEnabled) {
    return <HiPageShell />;
  }
  return <HiFallback />;
}
