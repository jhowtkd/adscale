'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AssistantCreateClientDialog from '@/components/assistant/AssistantCreateClientDialog';
import { useActiveClientProfile } from '@/lib/hooks/use-active-client-profile';
import { useClientProfiles } from '@/lib/hooks/use-client-profiles';
import type { GuestHandoff } from '@/lib/guest-home/handoff';
import type { ImportOutcome } from '@/lib/guest-home/import-contracts';
import { useGuestDraftImport } from '@/lib/guest-home/useGuestDraftImport';
import { loadDraft, loadImportReceipt, removeDraft } from './guest-store.mjs';
import { GuestDraftResume } from './GuestDraftResume';

export interface GuestStudioEntryProps {
  handoff: GuestHandoff;
  userId: string;
  workspaceId: string;
  importEnabled: boolean;
  /** Reserved for the #444 transfer UI; accepted now so the contract is stable. */
  attachmentsEnabled: boolean;
  conflictHrefs?: { openExisting: string; continueWithGuest: string };
}

type FrozenContext = { userId: string; workspaceId: string; clientProfileId: string };

const panelStyle = {
  padding: 16,
  margin: '12px 0',
  border: '1px solid var(--border-default, #4b3d59)',
  borderRadius: 12,
  background: 'var(--surface-raised, #1b1822)',
} as const;

const primaryAction = {
  padding: '8px 14px',
  borderRadius: 10,
  background: '#dfafea',
  color: '#211327',
} as const;

const secondaryAction = {
  padding: '8px 14px',
  border: '1px solid #766880',
  borderRadius: 10,
} as const;

function blockedMessage(code: string): string {
  switch (code) {
    case 'snapshot_changed':
      return 'O pedido mudou neste navegador. Revise e confirme novamente.';
    case 'lease_busy':
      return 'Outra aba está importando este pedido. Aguarde alguns segundos e tente novamente.';
    case 'receipt_context_mismatch':
      return 'Este pedido foi vinculado a outra marca ou sessão. Confira a marca selecionada e tente de novo.';
    case 'work_context_mismatch':
      return 'O Trabalho vinculado pertence a outro contexto. Confira a marca selecionada e tente de novo.';
    case 'storage_unavailable':
      return 'Não foi possível acessar o armazenamento local. Verifique o navegador e tente novamente.';
    case 'transfer_not_confirmed':
      return 'Não foi possível confirmar a importação. Tente novamente — nada foi duplicado.';
    default:
      return 'Não foi possível importar agora. Tente novamente.';
  }
}

/**
 * Authenticated entry for public requests (#443). Renders after the existing
 * server workspace guard: with no draft parameter the Studio is unchanged
 * (the page renders DashboardHomeActions instead). Import happens only by
 * explicit click with a valid draft and brand — mounting, brand selection,
 * or panel toggles never create or upload anything. Only a verified receipt
 * navigates to the Studio work.
 */
export function GuestStudioEntry({
  handoff, userId, workspaceId, importEnabled, conflictHrefs,
}: GuestStudioEntryProps) {
  const [confirming, setConfirming] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [confirmingRecoveryDiscard, setConfirmingRecoveryDiscard] = useState(false);
  const frozen = useRef<FrozenContext | null>(null);

  const guestDraftId = handoff.kind === 'guest' ? handoff.id : null;
  const profile = useActiveClientProfile();
  const brandList = useClientProfiles();
  const queryClient = useQueryClient();

  // Keyed read: a new guestDraftId starts a new read and stale responses
  // for other ids never clobber it. Recovery (import off) reads the same
  // snapshot for copy/discard.
  const draftQuery = useQuery({
    queryKey: ['guest-draft', guestDraftId],
    queryFn: () => loadDraft(guestDraftId as string),
    enabled: guestDraftId !== null,
    staleTime: 0,
    retry: false,
  });
  const draft = discarded ? null : (draftQuery.data ?? null);

  const importContext = profile.activeClientProfileId
    ? { userId, workspaceId, clientProfileId: profile.activeClientProfileId }
    : null;
  const { attempt, busy: importBusy, start: importStart } = useGuestDraftImport({
    draft,
    context: importContext,
  });
  const outcome: ImportOutcome | null = attempt.status === 'done' ? attempt.outcome : null;
  const terminalOutcome = outcome && outcome.kind !== 'blocked' ? outcome : null;
  // Partial keeps the snapshot and allows retry; verified and existing_changed lock the review.
  const reviewLocked = terminalOutcome?.kind === 'verified' || terminalOutcome?.kind === 'existing_changed';
  const importError = outcome?.kind === 'blocked' ? blockedMessage(outcome.code) : null;

  // A verified receipt can still open the authorized work after the content
  // snapshot was cleared. The full context must match — never a foreign brand.
  const receiptQuery = useQuery({
    queryKey: ['guest-import-receipt', guestDraftId],
    queryFn: () => loadImportReceipt(guestDraftId as string),
    enabled: guestDraftId !== null && draftQuery.data === null && !discarded && importEnabled,
    staleTime: 0,
    retry: false,
  });
  const receipt = receiptQuery.data ?? null;
  const recoverableWorkId = receipt?.phase === 'verified' && receipt.workId
    && receipt.userId === userId && receipt.workspaceId === workspaceId
    && receipt.clientProfileId === profile.activeClientProfileId
    ? receipt.workId
    : null;

  // Mid-review context change cancels new work and asks for reconciliation.
  // The import itself is bound to the frozen context by the lease claim.
  useEffect(() => {
    if (!confirming || !frozen.current) return;
    const live: FrozenContext = {
      userId,
      workspaceId,
      clientProfileId: profile.activeClientProfileId ?? '',
    };
    const cold = frozen.current;
    if (
      live.userId !== cold.userId ||
      live.workspaceId !== cold.workspaceId ||
      live.clientProfileId !== cold.clientProfileId
    ) {
      frozen.current = null;
      setConfirming(false);
      setReconcileError(
        'Sua sessão, workspace ou marca mudou durante a confirmação. Revise o pedido e confirme novamente.',
      );
    }
  }, [confirming, userId, workspaceId, profile.activeClientProfileId]);

  const handleConfirm = useCallback(async () => {
    if (!guestDraftId || !draft || confirming || importBusy || reviewLocked) return;
    const clientProfileId = profile.activeClientProfileId;
    if (!clientProfileId) return;
    frozen.current = { userId, workspaceId, clientProfileId };
    setConfirming(true);
    setReconcileError(null);
    try {
      const fresh = await loadDraft(guestDraftId);
      const cold = frozen.current;
      if (
        !cold ||
        cold.userId !== userId ||
        cold.workspaceId !== workspaceId ||
        cold.clientProfileId !== profile.activeClientProfileId ||
        !fresh ||
        fresh.id !== draft.id
      ) {
        setReconcileError(
          'O pedido ou o contexto mudou durante a confirmação. Revise e confirme novamente.',
        );
        return;
      }
      setConfirming(false);
      await importStart();
    } catch {
      setReconcileError('Não foi possível confirmar agora. Tente novamente.');
    } finally {
      frozen.current = null;
      setConfirming(false);
    }
  }, [guestDraftId, draft, confirming, importBusy, reviewLocked, profile.activeClientProfileId, userId, workspaceId, importStart]);

  const handleDiscard = useCallback(async () => {
    if (!guestDraftId) return;
    await removeDraft(guestDraftId);
    queryClient.setQueryData(['guest-draft', guestDraftId], null);
    setConfirming(false);
    setDiscarded(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('guestDraft');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* Read-only environments keep the parameter; the copy is gone regardless. */
    }
  }, [guestDraftId, queryClient]);

  const handleCopy = useCallback(async () => {
    if (!draft) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(draft.request);
    } catch {
      setCopyError('Não foi possível copiar. Selecione o texto acima.');
    }
  }, [draft]);

  if (handoff.kind === 'invalid') {
    return <section aria-label="Link de continuação inválido" data-guest-entry="invalid" style={panelStyle}>
      <strong>Este link de continuação é inválido.</strong>
      <p style={{ fontSize: 13 }}>Nenhum pedido foi aplicado. Verifique o link ou comece novamente pela página inicial.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <Link href="/hi" style={primaryAction}>Voltar à página inicial</Link>
        <Link href="/" style={secondaryAction}>Abrir o Estúdio</Link>
      </div>
    </section>;
  }

  if (handoff.kind === 'conflict') {
    return <section aria-label="Conflito entre pedido público e trabalho aberto" data-guest-entry="conflict" style={panelStyle}>
      <strong>Este link combina um pedido público com um trabalho aberto.</strong>
      <p style={{ fontSize: 13 }}>Escolha um caminho. Nada será sobrescrito sem a sua decisão.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <Link href={conflictHrefs?.openExisting ?? '/'} style={primaryAction}>Abrir o trabalho existente</Link>
        <Link href={conflictHrefs?.continueWithGuest ?? '/hi'} style={secondaryAction}>Continuar com o pedido da página inicial</Link>
      </div>
    </section>;
  }

  if (draftQuery.isLoading) {
    return <section aria-label="Lendo pedido salvo" data-guest-entry="loading" style={panelStyle}>
      <p style={{ fontSize: 13 }}>Lendo o pedido salvo neste navegador…</p>
    </section>;
  }

  if (discarded || draftQuery.data === null) {
    return <section aria-label="Pedido indisponível" data-guest-entry="missing" style={panelStyle}>
      <strong>{discarded ? 'Cópia local descartada.' : 'Este pedido não está disponível aqui.'}</strong>
      <p style={{ fontSize: 13 }}>
        {discarded
          ? 'Nenhum Trabalho foi criado ou alterado.'
          : 'Ele expirou ou foi preparado em outro navegador ou dispositivo. Rascunhos locais não sincronizam entre dispositivos.'}
      </p>
      {recoverableWorkId && <p style={{ fontSize: 13 }}>
        Este navegador já importou este pedido — a cópia local foi limpa após a confirmação.
      </p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        {recoverableWorkId && (
          <Link href={`/?workId=${recoverableWorkId}&compose=1`} style={primaryAction}>Abrir Trabalho importado</Link>
        )}
        <Link href="/hi" style={recoverableWorkId ? secondaryAction : primaryAction}>Voltar à página inicial</Link>
        <Link href="/" style={secondaryAction}>Abrir o Estúdio</Link>
      </div>
    </section>;
  }

  if (draftQuery.isError) {
    return <section aria-label="Falha ao ler pedido" data-guest-entry="load-error" style={panelStyle}>
      <strong>Não foi possível ler o pedido salvo neste navegador.</strong>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button type="button" onClick={() => void draftQuery.refetch()} style={primaryAction}>Tentar novamente</button>
        <Link href="/hi" style={secondaryAction}>Voltar à página inicial</Link>
      </div>
    </section>;
  }

  if (!draft) return null;

  if (!importEnabled) {
    return <section aria-label="Importação desligada" data-guest-entry="recovery" style={panelStyle}>
      <strong>A importação está desligada no momento.</strong>
      <p style={{ fontSize: 13, margin: '8px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.request}</p>
      <p style={{ fontSize: 12 }}>Sua cópia local está preservada. Copie o texto ou descarte-a — descartar nunca apaga um Trabalho.</p>
      {copyError && <p role="alert" style={{ color: 'var(--danger-text, #ffb7c5)' }}>{copyError}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <button type="button" onClick={() => void handleCopy()} style={secondaryAction}>Copiar texto</button>
        {confirmingRecoveryDiscard
          ? (<><button type="button" onClick={() => void handleDiscard()} style={{ padding: '8px 14px', borderRadius: 10, background: '#5c2530', color: '#ffdfe6' }}>Confirmar descarte</button>
            <button type="button" onClick={() => setConfirmingRecoveryDiscard(false)} style={secondaryAction}>Manter cópia</button></>)
          : (<button type="button" onClick={() => setConfirmingRecoveryDiscard(true)} style={secondaryAction}>Descartar cópia local</button>)}
      </div>
    </section>;
  }

  if (terminalOutcome?.kind === 'verified') {
    const cleanupFailed = attempt.status === 'done' && attempt.cleanupError;
    return <section aria-label="Pedido importado" data-guest-entry="imported" style={panelStyle}>
      <strong>Pedido importado.</strong>
      <p style={{ fontSize: 13 }}>Seu pedido virou um Trabalho no Estúdio. A cópia local foi limpa.</p>
      {cleanupFailed && <p role="alert" style={{ color: 'var(--danger-text, #ffb7c5)' }}>
        Importado, mas não foi possível limpar a cópia local. Abra o Trabalho e descarte a cópia de novo — o Trabalho não será apagado.
      </p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <Link href={`/?workId=${terminalOutcome.workId}&compose=1`} style={primaryAction}>Abrir no Estúdio</Link>
        {cleanupFailed && (
          <button type="button" onClick={() => void handleDiscard()} style={secondaryAction}>Descartar cópia local</button>
        )}
        <Link href="/hi" style={secondaryAction}>Voltar à página inicial</Link>
      </div>
    </section>;
  }

  if (terminalOutcome?.kind === 'existing_changed') {
    return <section aria-label="Trabalho existente diferente" data-guest-entry="existing-changed" style={panelStyle}>
      <strong>Este pedido já existe no Estúdio com outro conteúdo.</strong>
      <p style={{ fontSize: 13 }}>Abrimos a versão atual sem alterar nada — seu texto antigo não foi regravado.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <Link href={`/?workId=${terminalOutcome.workId}&compose=1`} style={primaryAction}>Abrir versão atual</Link>
        <button type="button" onClick={() => void handleCopy()} style={secondaryAction}>Copiar texto</button>
        <button type="button" onClick={() => void handleDiscard()} style={secondaryAction}>Descartar cópia local</button>
      </div>
      {copyError && <p role="alert" style={{ color: 'var(--danger-text, #ffb7c5)' }}>{copyError}</p>}
    </section>;
  }

  if (terminalOutcome?.kind === 'partial') {
    const pending = terminalOutcome.pendingFileIds.length;
    return <section aria-label="Texto importado, referências pendentes" data-guest-entry="partial" style={panelStyle}>
      <strong>Texto importado. {pending} referência(s) ainda não {pending === 1 ? 'foi transferida' : 'foram transferidas'}.</strong>
      <p style={{ fontSize: 13 }}>Sua cópia local está preservada para concluir a transferência. Nada foi duplicado.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <button type="button" onClick={() => void handleConfirm()} style={primaryAction}>Tentar novamente</button>
        <button type="button" onClick={() => void handleCopy()} style={secondaryAction}>Copiar texto</button>
        <Link href="/" style={secondaryAction}>Abrir o Estúdio</Link>
        <Link href="/hi" style={secondaryAction}>Voltar à página inicial</Link>
      </div>
      {copyError && <p role="alert" style={{ color: 'var(--danger-text, #ffb7c5)' }}>{copyError}</p>}
    </section>;
  }

  const busy = confirming || importBusy;
  const canConfirm =
    !busy && !terminalOutcome && !reconcileError && !profile.isLoading && !profile.isError && profile.activeClientProfileId !== null;

  return <section aria-label="Revisão do pedido público" data-guest-entry="panel" style={panelStyle}>
    {profile.isLoading && <p style={{ fontSize: 13 }}>Carregando marcas…</p>}
    {profile.isError && <div>
      <p role="alert" style={{ color: 'var(--danger-text, #ffb7c5)' }}>Não foi possível carregar suas marcas.</p>
      <button type="button" onClick={() => void brandList.refetch()} style={primaryAction}>Tentar novamente</button>
    </div>}
    {!profile.isLoading && !profile.isError && profile.profiles.length === 0 && <div>
      <p style={{ fontSize: 13 }}>Você ainda não tem uma marca. Crie uma para continuar — seu pedido fica guardado.</p>
      <button type="button" onClick={() => setBrandDialogOpen(true)} style={primaryAction}>Criar marca</button>
      <AssistantCreateClientDialog
        open={brandDialogOpen}
        onOpenChange={setBrandDialogOpen}
        onSuccess={(clientId) => {
          setBrandDialogOpen(false);
          profile.selectProfile(clientId);
        }}
      />
    </div>}
    {!profile.isLoading && !profile.isError && profile.profiles.length === 1 && (
      <p style={{ fontSize: 13 }}>Marca: <strong>{profile.profiles[0].name}</strong></p>
    )}
    {!profile.isLoading && !profile.isError && profile.profiles.length > 1 && (
      <label style={{ fontSize: 13, display: 'grid', gap: 8 }}>
        Escolha a marca deste pedido:
        <select
          aria-label="Marca do pedido"
          value={profile.activeClientProfileId ?? ''}
          onChange={(event) => profile.selectProfile(event.target.value)}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 10 }}
        >
          <option value="" disabled>Selecione uma marca</option>
          {profile.profiles.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
    )}
    <GuestDraftResume
      draft={draft}
      state={busy ? 'confirming' : 'ready'}
      error={reconcileError ?? importError ?? copyError}
      brandName={profile.activeProfile?.name ?? null}
      canConfirm={canConfirm}
      onConfirm={() => void handleConfirm()}
      onDiscard={() => void handleDiscard()}
      onCopy={() => void handleCopy()}
    />
  </section>;
}
