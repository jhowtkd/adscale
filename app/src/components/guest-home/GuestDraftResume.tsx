'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { GuestDraft } from './guest-core.mjs';

export type GuestDraftReviewState = 'review' | 'creating';

export type GuestDraftResumeProps = {
  draft: GuestDraft;
  brandName: string | null;
  state: GuestDraftReviewState;
  error: string | null;
  canConfirm: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  onCopy: () => void;
};

/**
 * Presentational review of a public draft. Loading by id belongs to
 * GuestStudioEntry; this component only renders explicit props.
 */
export default function GuestDraftResume({
  draft, brandName, state, error, canConfirm, onConfirm, onDiscard, onCopy,
}: GuestDraftResumeProps) {
  const t = useTranslations('guestEntry');
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const busy = state === 'creating';

  return (
    <section
      aria-label={t('reviewEyebrow')}
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-[var(--space-5)]"
    >
      <p className="text-[length:var(--text-caption)] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {t('reviewEyebrow')}
      </p>
      <h2 className="text-[length:var(--text-label)] font-medium text-[var(--text-secondary)]">{t('requestLabel')}</h2>
      <p className="text-[length:var(--text-body-lg)] text-[var(--text-primary)]" style={{ whiteSpace: 'pre-wrap' }}>
        {draft.request}
      </p>
      <div className="flex flex-wrap gap-x-[var(--space-4)] gap-y-[var(--space-1)] text-[length:var(--text-label)] text-[var(--text-secondary)]">
        {draft.files.length > 0 && (
          <p>{draft.files.length === 1
            ? t('referenceOne')
            : t('referenceOther', { count: draft.files.length })}</p>
        )}
        <p>{t('brandLabel')}: {brandName ?? '—'}</p>
      </div>
      {error && <p role="alert" className="text-[length:var(--text-label)] text-[var(--status-failed-text)]">{error}</p>}
      <div className="flex flex-wrap gap-[var(--space-2)] pt-[var(--space-1)]">
        <Button type="button" disabled={!canConfirm || busy} onClick={onConfirm}>
          {busy ? t('transferring') : t('confirm')}
        </Button>
        <Button type="button" variant="outline" onClick={onCopy}>{t('copy')}</Button>
        {!confirmingDiscard ? (
          <Button type="button" variant="ghost" onClick={() => setConfirmingDiscard(true)}>{t('discard')}</Button>
        ) : (
          <>
            <Button type="button" variant="destructive" onClick={() => { setConfirmingDiscard(false); onDiscard(); }}>
              {t('discardConfirm')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmingDiscard(false)}>{t('discardCancel')}</Button>
          </>
        )}
      </div>
    </section>
  );
}
