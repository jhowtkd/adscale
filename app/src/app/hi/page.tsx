import LocalPublicHomeFallback from "@/components/guest-home/LocalPublicHomeFallback";
import { HomeIslandSlot } from "@/components/guest-home/HomeIslandSlot";
import { readPublicStudioFlags } from "@/lib/public-studio-config";

/**
 * Public home route shell (#439; island owned by #440). Server component
 * switching on the pure flags: `homeEnabled` renders the interactive
 * visitor island (`HomeIslandSlot` is the temporary integration slot until
 * #440 lands `AdscaleGuestHome`); otherwise the local fallback. Never
 * redirects to `/` (anti-recursion: the proxy sends unauthenticated `/`
 * here).
 */
export default function HiPage() {
  const flags = readPublicStudioFlags(process.env);
  if (!flags.homeEnabled) return <LocalPublicHomeFallback />;
  return <HomeIslandSlot />;
}
