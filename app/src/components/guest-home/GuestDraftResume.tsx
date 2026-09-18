'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
    <section aria-label={t('reviewEyebrow')}>
      <p>{t('reviewEyebrow')}</p>
      <h2>{t('requestLabel')}</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{draft.request}</p>
      {draft.files.length > 0 && (
        <p>{draft.files.length === 1
          ? t('referenceOne')
          : t('referenceOther', { count: draft.files.length })}</p>
      )}
      <p>{t('brandLabel')}: {brandName ?? '—'}</p>
      {error && <p role="alert">{error}</p>}
      <div>
        <button type="button" disabled={!canConfirm || busy} onClick={onConfirm}>
          {busy ? t('transferring') : t('confirm')}
        </button>
        <button type="button" onClick={onCopy}>{t('copy')}</button>
        {!confirmingDiscard ? (
          <button type="button" onClick={() => setConfirmingDiscard(true)}>{t('discard')}</button>
        ) : (
          <>
            <button type="button" onClick={() => { setConfirmingDiscard(false); onDiscard(); }}>
              {t('discardConfirm')}
            </button>
            <button type="button" onClick={() => setConfirmingDiscard(false)}>{t('discardCancel')}</button>
          </>
        )}
      </div>
    </section>
  );
}
