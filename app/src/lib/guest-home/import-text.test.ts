import { describe, expect, it } from 'vitest';
import type {
  CanonicalDraft, GuestImportReceipt, ImportContext, TextImportPorts,
} from './import-contracts';
import type { GuestDraft } from '@/components/guest-home/guest-core.mjs';
import { buildTextDraftInput, ensureCanonicalGuestDraft } from './import-text';

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';
const CONTEXT: ImportContext = { userId: 'user-1', workspaceId: 'ws-1', clientProfileId: 'brand-1' };

function makeDraft(overrides: Partial<GuestDraft> = {}): GuestDraft {
  return {
    version: 1, id: DRAFT_ID, request: 'Anúncio de lançamento', intent: 'single',
    exampleId: null, files: [], createdAt: 1789680000000, expiresAt: 1789680000000 + 86400000,
    ...overrides,
  };
}

function scope(context: ImportContext, draftKey: string) {
  return `${context.workspaceId}:${context.userId}:${draftKey}`;
}

/** State-storing fake mirroring the canonical repository semantics. */
function makePorts() {
  const works = new Map<string, CanonicalDraft>();
  const receipts = new Map<string, GuestImportReceipt>();
  const calls = { create: 0, read: 0, loadReceipt: 0, saveReceipt: 0 };
  let onBeforeSave: (() => void) | null = null;
  let seq = 0;
  const ports: TextImportPorts = {
    loadReceipt: async (id) => {
      calls.loadReceipt += 1;
      const found = receipts.get(id);
      return found ? structuredClone(found) : null;
    },
    saveReceipt: async (receipt) => {
      calls.saveReceipt += 1;
      onBeforeSave?.();
      const current = receipts.get(receipt.guestDraftId);
      const revision = current ? current.revision : 0;
      if (revision !== receipt.revision) throw new Error('Recibo desatualizado.');
      receipts.set(receipt.guestDraftId, structuredClone({ ...receipt, revision: revision + 1 }));
    },
    createDraft: async (input) => {
      calls.create += 1;
      // Same scope + key returns the existing row (canonical idempotency).
      for (const work of works.values()) {
        if (work.draftKey === input.draftKey) return structuredClone(work);
      }
      seq += 1;
      const created: CanonicalDraft = {
        userId: CONTEXT.userId, workspaceId: CONTEXT.workspaceId,
        clientProfileId: input.clientProfileId, id: `work-${seq}`,
        draftKey: input.draftKey, request: input.request, intent: input.intent,
      };
      works.set(scope(CONTEXT, input.draftKey), structuredClone(created));
      return structuredClone(created);
    },
    readWork: async (id) => {
      calls.read += 1;
      for (const work of works.values()) {
        if (work.id === id) return structuredClone(work);
      }
      throw new Error('missing');
    },
    readByDraftKey: async (draftKey) => {
      for (const work of works.values()) {
        if (work.draftKey === draftKey) return structuredClone(work);
      }
      return null;
    },
  };
  return {
    ports, works, receipts, calls,
    armStaleWrite: (fn: () => void) => { onBeforeSave = fn; },
    armLostResponse: () => {
      const inner = ports.createDraft;
      ports.createDraft = (async (input) => {
        await inner(input);
        ports.createDraft = inner;
        throw new Error('response lost');
      });
    },
  };
}

describe('ensureCanonicalGuestDraft', () => {
  it('importa o pedido textual com a entrada canônica esperada', async () => {
    const { ports, receipts } = makePorts();
    const outcome = await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    expect(outcome).toEqual({ kind: 'verified', workId: 'work-1' });
    expect(receipts.get(DRAFT_ID)).toMatchObject({ workId: 'work-1', phase: 'verified', revision: 1 });
  });

  it('retry com a mesma chave abre o mesmo trabalho sem duplicar', async () => {
    const { ports, works, calls } = makePorts();
    const first = await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    const second = await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    expect(first).toEqual(second);
    expect(works.size).toBe(1);
    expect(calls.create).toBe(1);
  });

  it('não regrava o passado quando o registro existente mudou', async () => {
    const { ports, works } = makePorts();
    await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    const stored = works.get(scope(CONTEXT, DRAFT_ID))!;
    stored.request = 'Editado no Estúdio';
    const outcome = await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    expect(outcome).toEqual({ kind: 'existing_changed', workId: 'work-1' });
    expect(works.get(scope(CONTEXT, DRAFT_ID))!.request).toBe('Editado no Estúdio');
  });

  it('resposta perdida retoma o mesmo trabalho sem recriar', async () => {
    const { ports, works, receipts } = makePorts();
    await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    receipts.delete(DRAFT_ID);
    const outcome = await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    expect(outcome).toEqual({ kind: 'verified', workId: 'work-1' });
    expect(works.size).toBe(1);
  });

  it('falha na criação recupera o commit pela chave (I03)', async () => {
    const { ports, works, armLostResponse } = makePorts();
    armLostResponse();
    const outcome = await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    expect(outcome).toEqual({ kind: 'verified', workId: 'work-1' });
    expect(works.size).toBe(1);
  });

  it('falha sem commit propaga o erro original', async () => {
    const { ports } = makePorts();
    ports.createDraft = async () => { throw new Error('network down'); };
    await expect(
      ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports),
    ).rejects.toThrow('network down');
  });

  it('commit em marca divergente bloqueia sem adotar (I05)', async () => {
    const { ports, works } = makePorts();
    works.set(`ws-1:user-1:${DRAFT_ID}`, {
      userId: 'user-1', workspaceId: 'ws-1', clientProfileId: 'brand-2',
      id: 'work-9', draftKey: DRAFT_ID, request: 'Anúncio de lançamento', intent: 'single',
    });
    ports.createDraft = async () => { throw new Error('response lost'); };
    const outcome = await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    expect(outcome).toEqual({ kind: 'blocked', code: 'context_mismatch' });
  });

  it('contexto divergente é rejeitado sem escrita', async () => {
    const { ports, works, receipts } = makePorts();
    await ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports);
    const other = { ...CONTEXT, clientProfileId: 'brand-2' };
    const outcome = await ensureCanonicalGuestDraft({ draft: makeDraft(), context: other }, ports);
    expect(outcome).toEqual({ kind: 'blocked', code: 'context_mismatch' });
    expect(works.size).toBe(1);
    expect(receipts.size).toBe(1);
  });

  it('escrita concorrente no recibo não é sobrescrita em silêncio', async () => {
    const { ports, receipts, armStaleWrite } = makePorts();
    receipts.set(DRAFT_ID, {
      ...CONTEXT, guestDraftId: DRAFT_ID, workId: null, phase: 'claimed',
      references: [], expiresAt: 1789680000000 + 86400000, revision: 1,
      leaseOwner: null, leaseExpiresAt: 0,
    });
    armStaleWrite(() => {
      const current = receipts.get(DRAFT_ID)!;
      receipts.set(DRAFT_ID, { ...current, revision: current.revision + 1 });
    });
    await expect(
      ensureCanonicalGuestDraft({ draft: makeDraft(), context: CONTEXT }, ports),
    ).rejects.toThrow();
  });

  it('monta a entrada textual canônica a partir do rascunho', () => {
    expect(buildTextDraftInput(makeDraft(), CONTEXT)).toEqual({
      clientProfileId: 'brand-1',
      draftKey: DRAFT_ID,
      request: 'Anúncio de lançamento',
      intent: 'single',
      format: '4:5',
      settings: { formatMode: 'auto', targetFormats: ['1:1', '9:16'] },
    });
  });
});
