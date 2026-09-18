import AdscaleGuestHome from "@/components/guest-home/AdscaleGuestHome";
import LocalPublicHomeFallback from "@/components/guest-home/LocalPublicHomeFallback";
import { readPublicStudioFlags } from "@/lib/public-studio-config";

/**
 * Public home (#439 shell, #440 island). Server component switching on the
 * pure flags: without home, the local containment fallback; with home, the
 * interactive visitor island. The island navigates same-origin on continue
 * (default `onContinue`) with only the opaque draft UUID in the URL —
 * auth-return preservation is #441's job. Never redirects to `/`
 * (anti-recursion: the proxy sends unauthenticated `/` here).
 */
export default function HiPage() {
  const flags = readPublicStudioFlags(process.env);
  if (!flags.homeEnabled) return <LocalPublicHomeFallback />;
  return (
    <AdscaleGuestHome
      assetBase="/adscale-guest"
      preview={false}
      attachmentsEnabled={flags.attachmentsEnabled}
    />
  );
}
