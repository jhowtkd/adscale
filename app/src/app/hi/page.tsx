import type { Metadata } from 'next';
import LocalPublicHomeFallback from '@/components/guest-home/LocalPublicHomeFallback';
import AdscaleGuestHome from '@/components/guest-home/AdscaleGuestHome';
import { readPublicStudioFlags } from '@/lib/public-studio-config';

export const metadata: Metadata = {
  title: 'Adscale — comece sua próxima criação',
  description: 'Descreva sua ideia e continue a criação no Estúdio Adscale.',
  alternates: { canonical: 'https://adscale.jhonatansoares.com/hi' },
};

export default function HiPage() {
  const flags = readPublicStudioFlags(process.env);
  if (!flags.homeEnabled) return <LocalPublicHomeFallback />;
  return <AdscaleGuestHome
    assetBase="/adscale-guest"
    preview={false}
    attachmentsEnabled={flags.attachmentsEnabled}
  />;
}
