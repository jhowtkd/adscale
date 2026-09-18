'use client';

import { useState } from 'react';
import type { GuestDraft } from './guest-core.mjs';

export type GuestDraftReviewState = 'ready' | 'confirming';

export type GuestDraftResumeProps = {
  /** Draft loaded by the parent. This component never reads storage or the URL itself. */
  draft: GuestDraft;
  state: GuestDraftReviewState;
  error: string | null;
  /** Real selected brand name, or null when none is selected yet. */
  brandName: string | null;
  canConfirm: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  onCopy: () => void;
};

/**
 * Props-driven review of a public request (#442). Loading, staleness, brand
 * state, and typed outcomes live in GuestStudioEntry — this panel renders
 * and reports clicks. Local discard always asks first and never deletes a
 * canonical Work (it only clears this browser's copy).
 */
export function GuestDraftResume({
  draft, state, error, brandName, canConfirm, onConfirm, onDiscard, onCopy,
}: GuestDraftResumeProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const busy = state === 'confirming';
  return <aside aria-label="Pedido preparado na página inicial" data-guest-entry="review" style={{ padding: 16, margin: '12px 0', border: '1px solid var(--border-default, #4b3d59)', borderRadius: 12, background: 'var(--surface-raised, #1b1822)' }}>
    <strong>Seu pedido está aqui.</strong>
    <p style={{ fontSize: 13, margin: '8px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.request}</p>
    <p style={{ fontSize: 12 }}>
      {draft.files.length} referência(s).{' '}
      {brandName ? `Marca: ${brandName}.` : 'Escolha uma marca para continuar.'}
    </p>
    {error && <p role="alert" style={{ color: 'var(--danger-text, #ffb7c5)' }}>{error}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
      <button type="button" disabled={!canConfirm || busy} onClick={onConfirm} style={{ padding: '8px 14px', borderRadius: 10, background: '#dfafea', color: '#211327' }}>{busy ? 'Confirmando…' : 'Usar este pedido'}</button>
      <button type="button" disabled={busy} onClick={onCopy} style={{ padding: '8px 14px', border: '1px solid #766880', borderRadius: 10 }}>Copiar texto</button>
      {confirmingDiscard
        ? (<><button type="button" disabled={busy} onClick={onDiscard} style={{ padding: '8px 14px', borderRadius: 10, background: '#5c2530', color: '#ffdfe6' }}>Confirmar descarte</button>
          <button type="button" disabled={busy} onClick={() => setConfirmingDiscard(false)} style={{ padding: '8px 14px', border: '1px solid #766880', borderRadius: 10 }}>Manter cópia</button></>)
        : (<button type="button" disabled={busy} onClick={() => setConfirmingDiscard(true)} style={{ padding: '8px 14px', border: '1px solid #766880', borderRadius: 10 }}>Descartar cópia local</button>)}
    </div>
  </aside>;
}
