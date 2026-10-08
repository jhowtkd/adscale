import type { Metadata } from 'next';
import LocalPublicHomeFallback from '@/components/guest-home/LocalPublicHomeFallback';
import AdscaleGuestHome from '@/components/guest-home/AdscaleGuestHome';
import { readPublicStudioFlags } from '@/lib/public-studio-config';

export const metadata: Metadata = {
  title: 'Adscale — comece sua próxima criação',
  description: 'Descreva sua ideia e continue a criação no Estúdio Adscale.',
  alternates: { canonical: 'https://adscaleapp.com/hi' },
};

/**
 * Public home (#439 shell, #440 island). Server component switching on the
 * pure flags: without home, the local containment fallback; with home, the
 * interactive visitor island. On continue (default `onContinue`) the island
 * navigates same-origin to the login entry, with no draft id and no query in
 * the URL: the guest's draft is not reconnected (spec 2026-10-07 §4), and after
 * signing in or up the guest lands on `/` like anyone else. It goes to `/login`
 * and not to `/` because the proxy sends an unauthenticated `/` to MARKETING_URL
 * (this page), so a bare `/` would loop back here without ever showing the login.
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
