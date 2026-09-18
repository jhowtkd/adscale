import type { Metadata } from 'next';
import LocalPublicHomeFallback from '@/components/guest-home/LocalPublicHomeFallback';
import { readPublicStudioFlags } from '@/lib/public-studio-config';

export const metadata: Metadata = {
  title: 'Adscale — comece sua próxima criação',
  description: 'Descreva sua ideia e continue a criação no Estúdio Adscale.',
  alternates: { canonical: 'https://adscale.jhonatansoares.com/hi' },
};

export default function HiPage() {
  // Validates flag consistency (throws on invalid combos). S2 wires the
  // interactive island on flags.homeEnabled; until then fail closed.
  readPublicStudioFlags(process.env);
  return <LocalPublicHomeFallback />;
}
