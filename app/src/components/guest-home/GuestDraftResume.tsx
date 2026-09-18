'use client';

import { useEffect, useState } from 'react';
import type { GuestDraft } from './guest-core.mjs';
import { loadDraft, removeDraft } from './guest-store.mjs';

type Props = {
  /** Only true after the authenticated workspace/brand is loaded and a fresh composer is ready. */
  ready: boolean;
  /** Apply to the canonical composer. This must not submit an AI generation. */
  onApply: (draft: GuestDraft) => Promise<void>;
};

/**
 * Optional authenticated handoff UI. The public route must never mount this.
 * Drafts are NOT deleted after onApply: canonical autosave/upload may still be
 * running. Keep recovery data until an explicit discard or its 24h expiry.
 */
export function GuestDraftResume({ ready, onApply }: Props) {
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('guestDraft');
    if (!id) return;
    let active = true;
    void loadDraft(id).then((value) => {
      if (!active) return;
      if (!value) setError('Este pedido expirou ou foi preparado em outro navegador. Volte à página inicial para começar novamente.');
      else setDraft(value);
    }).catch(() => { if (active) setError('Não foi possível ler o pedido salvo neste navegador.'); });
    return () => { active = false; };
  }, []);

  async function apply() {
    if (!ready || !draft || busy || applied) return;
    setBusy(true); setError('');
    try {
      await onApply(draft);
      setApplied(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível transferir o pedido. Ele continua salvo neste navegador.');
    } finally { setBusy(false); }
  }
  async function discard() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await removeDraft(draft.id); setDraft(null); setError('');
      const url = new URL(window.location.href); url.searchParams.delete('guestDraft');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { setError('Não foi possível descartar o pedido salvo.'); }
    finally { setBusy(false); }
  }
  if (!draft && !error) return null;
  return <aside aria-label="Pedido preparado na página inicial" style={{ padding: 16, margin: '12px 0', border: '1px solid var(--border-default, #4b3d59)', borderRadius: 12, background: 'var(--surface-raised, #1b1822)' }}>
    <strong>{applied ? 'Pedido aplicado ao formulário' : 'Seu pedido está aqui.'}</strong>
    {draft && <p style={{ fontSize: 13, margin: '8px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.request}</p>}
    {draft && !applied && <p style={{ fontSize: 12 }}>{draft.files.length} referência(s). {ready ? 'Revise a marca ativa antes de continuar.' : 'Escolha sua marca e abra um pedido vazio para continuar.'}</p>}
    {applied && <p style={{ fontSize: 12 }}>Confira o texto e os anexos no composer. A cópia local é mantida para recuperação até você descartá-la ou ela expirar.</p>}
    {error && <p role="alert" style={{ color: 'var(--danger-text, #ffb7c5)' }}>{error}</p>}
    {draft && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
      {!applied && <button type="button" disabled={!ready || busy} onClick={() => void apply()} style={{ padding: '8px 14px', borderRadius: 10, background: '#dfafea', color: '#211327' }}>{busy ? 'Transferindo…' : 'Usar este pedido'}</button>}
      <button type="button" disabled={busy} onClick={() => void discard()} style={{ padding: '8px 14px', border: '1px solid #766880', borderRadius: 10 }}>Descartar cópia local</button>
    </div>}
  </aside>;
}
