'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import ActiveBrandSwitcher from '@/components/layout/ActiveBrandSwitcher';
import { useActiveClientProfile } from '@/lib/hooks/use-active-client-profile';
import type { ImportOutcome } from '@/lib/guest-home/import-contracts';
import type { GuestDraft } from './guest-core.mjs';
import { recordGuestDraftImported } from '@/lib/guest-home/telemetry';
import { loadDraft, removeDraft } from './guest-store.mjs';
import GuestDraftResume from './GuestDraftResume';
import { useGuestDraftImport } from './useGuestDraftImport';

export type GuestConflict = {
  workId?: string;
  templateId?: string;
  campaignId?: string;
};

export type GuestStudioEntryProps = {
  guestDraftId: string;
  userId: string | null;
  workspaceId: string | null;
  importEnabled: boolean;
  attachmentsEnabled: boolean;
  conflict: GuestConflict | null;
};

function stripParams(href: string, remove: string[]): string {
  const url = new URL(href);
  for (const key of remove) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

function DiscardButton({ onDiscarded }: { onDiscarded: () => void }) {
  const t = useTranslations('guestEntry');
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)}>{t('discard')}</button>;
  }
  return (
    <>
      <button type="button" onClick={() => { setConfirming(false); onDiscarded(); }}>
        {t('discardConfirm')}
      </button>
      <button type="button" onClick={() => setConfirming(false)}>{t('discardCancel')}</button>
    </>
  );
}

export default function GuestStudioEntry({
  guestDraftId, userId, workspaceId, importEnabled, attachmentsEnabled, conflict,
}: GuestStudioEntryProps) {
  const t = useTranslations('guestEntry');
  const router = useRouter();
  const queryClient = useQueryClient();
  const brands = useActiveClientProfile();
  const { importDraft } = useGuestDraftImport(attachmentsEnabled);

  const [loaded, setLoaded] = useState<{ id: string; draft: GuestDraft | null } | null>(null);
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string; code?: string } | null>(null);
  const [partial, setPartial] = useState<{ id: string; workId: string; pendingFileIds: string[] } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [discardedId, setDiscardedId] = useState<string | null>(null);

  const loadSeq = useRef(0);
  const importSeq = useRef(0);
  const liveContext = useRef({ userId, workspaceId, clientProfileId: brands.activeClientProfileId });

  useEffect(() => {
    liveContext.current = { userId, workspaceId, clientProfileId: brands.activeClientProfileId };
  });

  useEffect(() => {
    if (conflict) return;
    const seq = (loadSeq.current += 1);
    importSeq.current += 1;
    let cancelled = false;
    loadDraft(guestDraftId).then(
      (loadedDraft) => {
        if (!cancelled && seq === loadSeq.current) setLoaded({ id: guestDraftId, draft: loadedDraft });
      },
      () => {
        if (!cancelled && seq === loadSeq.current) setLoaded({ id: guestDraftId, draft: null });
      },
    );
    return () => { cancelled = true; };
  }, [conflict, guestDraftId]);

  const draft = !conflict && loaded?.id === guestDraftId ? loaded.draft : undefined;
  const discarded = discardedId === guestDraftId;
  const error = failure?.id === guestDraftId ? failure.message : null;
  const copied = copiedId === guestDraftId;
  const busy = busyFor === guestDraftId;

  if (conflict) {
    const href = typeof window === 'undefined' ? '/' : window.location.href;
    return (
      <section aria-label={t('conflictTitle')}>
        <h2>{t('conflictTitle')}</h2>
        <p>{t('conflictBody')}</p>
        <Link href={stripParams(href, ['guestDraft'])}>{t('openExisting')}</Link>
        <Link href={stripParams(href, ['workId', 'templateId', 'campaignId'])}>
          {t('continueWithGuest')}
        </Link>
      </section>
    );
  }

  if (draft === undefined) return <p>{t('loading')}</p>;

  if (discarded) {
    return (
      <section aria-label={t('discardDone')}>
        <p>{t('discardDone')}</p>
        <Link href="/">{t('goToStudio')}</Link>
        <Link href="/hi">{t('backToHome')}</Link>
      </section>
    );
  }

  if (draft === null) {
    return (
      <section aria-label={t('missingTitle')}>
        <h2>{t('missingTitle')}</h2>
        <p>{t('missingBody')}</p>
        <Link href="/hi">{t('backToHome')}</Link>
      </section>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft.request);
      setCopiedId(draft.id);
    } catch {
      setFailure({ id: draft.id, message: t('blockedMessage') });
    }
  };

  const handleDiscard = async () => {
    try {
      await removeDraft(draft.id);
      const clean = stripParams(window.location.href, ['guestDraft']);
      window.history.replaceState(null, '', clean);
      setDiscardedId(draft.id);
    } catch {
      setFailure({ id: draft.id, message: t('blockedMessage') });
    }
  };

  const recovery = (titleKey: 'importDisabledTitle' | 'noWorkspaceTitle', bodyKey: 'importDisabledBody' | 'noWorkspaceBody') => (
    <section aria-label={t(titleKey)}>
      <h2>{t(titleKey)}</h2>
      <p>{t(bodyKey)}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{draft.request}</p>
      {error && <p role="alert">{error}</p>}
      {copied && <p>{t('copied')}</p>}
      <button type="button" onClick={handleCopy}>{t('copy')}</button>
      <DiscardButton onDiscarded={handleDiscard} />
    </section>
  );

  if (!userId || !workspaceId) return recovery('noWorkspaceTitle', 'noWorkspaceBody');
  if (!importEnabled) return recovery('importDisabledTitle', 'importDisabledBody');

  if (brands.isLoading) return <p>{t('loading')}</p>;
  if (brands.isError) {
    return (
      <section aria-label={t('brandLoadError')}>
        <p role="alert">{t('brandLoadError')}</p>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['client-profiles'] })}
        >
          {t('retry')}
        </button>
      </section>
    );
  }

  const handleConfirm = async (textOnly = false) => {
    const context = {
      userId,
      workspaceId,
      clientProfileId: brands.activeClientProfileId ?? '',
    };
    if (!context.clientProfileId || busy) return;
    const seq = (importSeq.current += 1);
    setBusyFor(guestDraftId);
    setFailure(null);
    setPartial(null);
    let outcome: ImportOutcome;
    try {
      outcome = await importDraft(textOnly ? { draft, context, textOnly: true } : { draft, context });
    } catch {
      if (seq !== importSeq.current) return;
      setBusyFor(null);
      setFailure({ id: guestDraftId, message: t('blockedMessage') });
      return;
    }
    if (seq !== importSeq.current) return;
    const live = liveContext.current;
    if (live.userId !== context.userId || live.workspaceId !== context.workspaceId
      || live.clientProfileId !== context.clientProfileId) {
      setBusyFor(null);
      setFailure({ id: guestDraftId, message: t('contextChanged') });
      return;
    }
    if (outcome.kind === 'verified' || outcome.kind === 'existing_changed') {
      setBusyFor(null);
      try {
        recordGuestDraftImported({ workId: outcome.workId, referenceCount: draft.files.length });
      } catch {
        // Analytics must never block the verified import.
      }
      router.push(`/?workId=${outcome.workId}&compose=1`);
      return;
    }
    setBusyFor(null);
    if (outcome.kind === 'partial') {
      setPartial({ id: guestDraftId, workId: outcome.workId, pendingFileIds: outcome.pendingFileIds });
      setFailure({ id: guestDraftId, message: t('partialMessage') });
      return;
    }
    setFailure({
      id: guestDraftId,
      message: outcome.code === 'attachments_disabled'
        ? t('attachmentsDisabledMessage')
        : t('blockedMessage'),
      code: outcome.code,
    });
  };

  const canConfirm = !busy && !brands.requiresSelection && brands.activeClientProfileId !== null;

  return (
    <div>
      {brands.profiles.length === 0 && (
        <section aria-label={t('noBrandTitle')}>
          <h2>{t('noBrandTitle')}</h2>
          <p>{t('noBrandBody')}</p>
        </section>
      )}
      {brands.requiresSelection && <p>{t('selectBrand')}</p>}
      <ActiveBrandSwitcher />
      {copied && <p>{t('copied')}</p>}
      <GuestDraftResume
        draft={draft}
        brandName={brands.activeProfile?.name ?? null}
        state={busy ? 'creating' : 'review'}
        error={error}
        canConfirm={canConfirm}
        onConfirm={() => handleConfirm()}
        onDiscard={handleDiscard}
        onCopy={handleCopy}
      />
      {partial?.id === guestDraftId && !busy && (
        <section aria-label={t('partialMessage')}>
          <p>{partial.pendingFileIds.length === 1
            ? t('partialPendingOne')
            : t('partialPending', { count: partial.pendingFileIds.length })}</p>
          <button type="button" onClick={() => handleConfirm()}>{t('partialRetry')}</button>
          <button type="button" onClick={() => handleConfirm(true)}>{t('textOnlyConfirm')}</button>
        </section>
      )}
      {failure?.id === guestDraftId && failure.code === 'attachments_disabled' && !busy && (
        <section aria-label={t('attachmentsDisabledMessage')}>
          <button type="button" onClick={() => handleConfirm(true)}>{t('textOnlyConfirm')}</button>
        </section>
      )}
    </div>
  );
}
