'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import ActiveBrandSwitcher from '@/components/layout/ActiveBrandSwitcher';
import { Button } from '@/components/ui/button';
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

const SHELL = 'mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-4)] px-[var(--space-4)] py-[var(--space-6)]';
const PANEL = 'flex flex-col gap-[var(--space-3)] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-[var(--space-5)]';
const TITLE = 'text-[length:var(--text-section)] font-medium text-[var(--text-primary)]';
const BODY = 'text-[length:var(--text-body)] text-[var(--text-secondary)]';
const ACTIONS = 'flex flex-wrap gap-[var(--space-2)]';
const ALERT = 'text-[length:var(--text-label)] text-[var(--status-failed-text)]';
const LINK = 'inline-flex h-[var(--control-md)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] px-[var(--space-3)] text-[length:var(--text-body)] font-medium text-[var(--text-primary)] hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]';

function stripParams(href: string, remove: string[]): string {
  const url = new URL(href);
  for (const key of remove) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

function DiscardButton({ onDiscarded }: { onDiscarded: () => void }) {
  const t = useTranslations('guestEntry');
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>{t('discard')}</Button>;
  }
  return (
    <>
      <Button type="button" variant="destructive" onClick={() => { setConfirming(false); onDiscarded(); }}>
        {t('discardConfirm')}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>{t('discardCancel')}</Button>
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
  const importRunning = useRef(false);
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
      <div className={SHELL}>
        <section aria-label={t('conflictTitle')} className={PANEL}>
          <h2 className={TITLE}>{t('conflictTitle')}</h2>
          <p className={BODY}>{t('conflictBody')}</p>
          <div className={ACTIONS}>
            <Link className={LINK} href={stripParams(href, ['guestDraft'])}>{t('openExisting')}</Link>
            <Link className={LINK} href={stripParams(href, ['workId', 'templateId', 'campaignId'])}>
              {t('continueWithGuest')}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (draft === undefined) return <div className={SHELL}><p className={BODY}>{t('loading')}</p></div>;

  if (discarded) {
    return (
      <div className={SHELL}>
        <section aria-label={t('discardDone')} className={PANEL}>
          <p className={BODY}>{t('discardDone')}</p>
          <div className={ACTIONS}>
            <Link className={LINK} href="/">{t('goToStudio')}</Link>
            <Link className={LINK} href="/hi">{t('backToHome')}</Link>
          </div>
        </section>
      </div>
    );
  }

  if (draft === null) {
    return (
      <div className={SHELL}>
        <section aria-label={t('missingTitle')} className={PANEL}>
          <h2 className={TITLE}>{t('missingTitle')}</h2>
          <p className={BODY}>{t('missingBody')}</p>
          <div className={ACTIONS}>
            <Link className={LINK} href="/hi">{t('backToHome')}</Link>
          </div>
        </section>
      </div>
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
    <div className={SHELL}>
      <section aria-label={t(titleKey)} className={PANEL}>
        <h2 className={TITLE}>{t(titleKey)}</h2>
        <p className={BODY}>{t(bodyKey)}</p>
        <p className="text-[length:var(--text-body-lg)] text-[var(--text-primary)]" style={{ whiteSpace: 'pre-wrap' }}>{draft.request}</p>
        {error && <p role="alert" className={ALERT}>{error}</p>}
        {copied && <p className={BODY}>{t('copied')}</p>}
        <div className={ACTIONS}>
          <Button type="button" variant="outline" onClick={handleCopy}>{t('copy')}</Button>
          <DiscardButton onDiscarded={handleDiscard} />
        </div>
      </section>
    </div>
  );

  if (!userId || !workspaceId) return recovery('noWorkspaceTitle', 'noWorkspaceBody');
  if (!importEnabled) return recovery('importDisabledTitle', 'importDisabledBody');

  if (brands.isLoading) return <div className={SHELL}><p className={BODY}>{t('loading')}</p></div>;
  if (brands.isError) {
    return (
      <div className={SHELL}>
        <section aria-label={t('brandLoadError')} className={PANEL}>
          <p role="alert" className={ALERT}>{t('brandLoadError')}</p>
          <div className={ACTIONS}>
            <Button
              type="button"
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['client-profiles'] })}
            >
              {t('retry')}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const handleConfirm = async (textOnly = false) => {
    const context = {
      userId,
      workspaceId,
      clientProfileId: brands.activeClientProfileId ?? '',
    };
    if (!context.clientProfileId || busy || importRunning.current) return;
    importRunning.current = true;
    const seq = (importSeq.current += 1);
    setBusyFor(guestDraftId);
    setFailure(null);
    setPartial(null);
    let outcome: ImportOutcome;
    try {
      outcome = await importDraft(textOnly ? { draft, context, textOnly: true } : { draft, context });
    } catch {
      importRunning.current = false;
      if (seq !== importSeq.current) return;
      setBusyFor(null);
      setFailure({ id: guestDraftId, message: t('blockedMessage') });
      return;
    }
    try {
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
    } finally {
      importRunning.current = false;
    }
  };

  const canConfirm = !busy && !brands.requiresSelection && brands.activeClientProfileId !== null;

  return (
    <div className={SHELL}>
      {brands.profiles.length === 0 && (
        <section aria-label={t('noBrandTitle')} className={PANEL}>
          <h2 className={TITLE}>{t('noBrandTitle')}</h2>
          <p className={BODY}>{t('noBrandBody')}</p>
        </section>
      )}
      <div className="flex flex-col gap-[var(--space-2)]">
        {brands.requiresSelection && <p className={BODY}>{t('selectBrand')}</p>}
        <ActiveBrandSwitcher />
      </div>
      {copied && <p className={BODY}>{t('copied')}</p>}
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
        <section aria-label={t('partialMessage')} className={PANEL}>
          <p className={BODY}>{partial.pendingFileIds.length === 1
            ? t('partialPendingOne')
            : t('partialPending', { count: partial.pendingFileIds.length })}</p>
          <div className={ACTIONS}>
            <Button type="button" onClick={() => handleConfirm()}>{t('partialRetry')}</Button>
            <Button type="button" variant="outline" onClick={() => handleConfirm(true)}>{t('textOnlyConfirm')}</Button>
          </div>
        </section>
      )}
      {failure?.id === guestDraftId && failure.code === 'attachments_disabled' && !busy && (
        <section aria-label={t('attachmentsDisabledMessage')} className={ACTIONS}>
          <Button type="button" variant="outline" onClick={() => handleConfirm(true)}>{t('textOnlyConfirm')}</Button>
        </section>
      )}
    </div>
  );
}
