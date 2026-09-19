import type { Metadata } from 'next';
import LocalPublicHomeFallback from '@/components/guest-home/LocalPublicHomeFallback';
import AdscaleGuestHome from '@/components/guest-home/AdscaleGuestHome';
import { readPublicStudioFlags } from '@/lib/public-studio-config';

export const metadata: Metadata = {
  title: 'Adscale — comece sua próxima criação',
  description: 'Descreva sua ideia e continue a criação no Estúdio Adscale.',
  alternates: { canonical: 'https://adscale.jhonatansoares.com/hi' },
};

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
  return <AdscaleGuestHome
    assetBase="/adscale-guest"
    preview={false}
    attachmentsEnabled={flags.attachmentsEnabled}
  />;
}
