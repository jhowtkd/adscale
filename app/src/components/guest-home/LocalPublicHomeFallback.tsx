import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function LocalPublicHomeFallback() {
  const t = await getTranslations('publicHome');
  return (
    <main id="main" data-public-home-mode="fallback"
      className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center gap-5 px-6 py-16">
      <p className="text-sm tracking-widest">{t('fallbackEyebrow')}</p>
      <h1 className="text-3xl font-semibold">{t('fallbackTitle')}</h1>
      <p>{t('fallbackDescription')}</p>
      <Link href="/login?callbackUrl=%2F"
        className="w-fit rounded-lg border px-5 py-3 focus-visible:outline focus-visible:outline-2">
        {t('fallbackLogin')}
      </Link>
    </main>
  );
}
