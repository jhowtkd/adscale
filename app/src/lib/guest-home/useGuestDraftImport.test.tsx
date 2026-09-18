import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createDraft } from '@/components/guest-home/guest-core.mjs';
import type {
  GuestImportReceipt,
  ImportContext,
} from './import-contracts';

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';
const WORK_ID = 'bb222222-2222-4222-8222-222222222222';

const context: ImportContext = { userId: 'user-a', workspaceId: 'workspace-a', clientProfileId: 'brand-a' };

const memory = vi.hoisted(() => ({
  drafts: new Map<string, unknown>(),
  receipts: new Map<string, GuestImportReceipt>(),
  claimResult: null as unknown,
  saveError: null as unknown,
  removeError: null as unknown,
}));

vi.mock('@/components/guest-home/guest-store.mjs', () => {
  const clone = <T,>(value: T): T => structuredClone(value);
  return {
    loadDraft: vi.fn(async (id: string) => clone(memory.drafts.get(id) ?? null)),
    removeDraft: vi.fn(async (id: string) => {
      if (memory.removeError) throw memory.removeError;
      memory.drafts.delete(id);
    }),
    loadImportReceipt: vi.fn(async (id: string) => clone(memory.receipts.get(id) ?? null)),
    saveImportReceipt: vi.fn(async (receipt: GuestImportReceipt, expectedRevision: number) => {
      if (memory.saveError) throw memory.saveError;
      const stored = memory.receipts.get(receipt.guestDraftId);
      const current = stored ? stored.revision : 0;
      if (current !== expectedRevision || receipt.revision !== expectedRevision) {
        throw new Error('import_receipt_conflict');
      }
      const advanced = { ...clone(receipt), revision: expectedRevision + 1 };
      memory.receipts.set(receipt.guestDraftId, advanced);
      return clone(advanced);
    }),
    claimImportLease: vi.fn(async (id: string, claimContext: ImportContext, owner: string, now: number) => {
      if (memory.claimResult) return memory.claimResult;
      const stored = memory.receipts.get(id) ?? null;
      if (stored && (stored.userId !== claimContext.userId
        || stored.workspaceId !== claimContext.workspaceId
        || stored.clientProfileId !== claimContext.clientProfileId)) {
        return { kind: 'context_mismatch' };
      }
      const snapshot = memory.drafts.get(id) as { expiresAt: number } | undefined;
      if (!stored && !snapshot) return { kind: 'unavailable' };
      const next: GuestImportReceipt = {
        ...claimContext,
        guestDraftId: id,
        workId: stored?.workId ?? null,
        phase: stored?.phase ?? 'claimed',
        references: stored ? clone(stored.references) : [],
        expiresAt: stored?.expiresAt ?? snapshot!.expiresAt,
        revision: (stored?.revision ?? 0) + 1,
        leaseOwner: owner,
        leaseExpiresAt: now + 120_000,
      };
      memory.receipts.set(id, clone(next));
      return { kind: 'acquired', receipt: clone(next) };
    }),
    renewImportLease: vi.fn(async () => true),
    releaseImportLease: vi.fn(async () => undefined),
  };
});

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock('@/lib/hooks/use-creative-work', () => ({
  useCreateCreativeWorkDraft: () => ({ mutateAsync }),
}));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch }));

import { useGuestDraftImport, toCanonicalDraft } from './useGuestDraftImport';
import {
  claimImportLease,
  loadDraft,
  releaseImportLease,
  removeDraft,
} from '@/components/guest-home/guest-store.mjs';

function seedDraft() {
  const draft = createDraft({ request: 'Uma peça de lançamento', intent: 'single', files: [] }, DRAFT_ID);
  memory.drafts.set(DRAFT_ID, structuredClone(draft));
  return draft;
}

function canonicalWork(overrides: Record<string, unknown> = {}) {
  return {
    id: WORK_ID,
    workspaceId: context.workspaceId,
    clientProfileId: context.clientProfileId,
    createdByUserId: context.userId,
    draftKey: DRAFT_ID,
    request: 'Uma peça de lançamento',
    toolKind: 'single',
    ...overrides,
  };
}

beforeEach(() => {
  memory.drafts.clear();
  memory.receipts.clear();
  memory.claimResult = null;
  memory.saveError = null;
  memory.removeError = null;
  mutateAsync.mockReset();
  apiFetch.mockReset();
  vi.mocked(loadDraft).mockClear();
  vi.mocked(claimImportLease).mockClear();
  vi.mocked(removeDraft).mockClear();
  vi.mocked(releaseImportLease).mockClear();
});

it('começa ocioso e ignora tentativa sem pedido ou contexto', async () => {
  const { result } = renderHook(() => useGuestDraftImport({ draft: null, context }));
  expect(result.current.attempt).toEqual({ status: 'idle' });
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toBeNull();
  expect(claimImportLease).not.toHaveBeenCalled();
  expect(mutateAsync).not.toHaveBeenCalled();
});

it('importa com payload mínimo, verifica e limpa o snapshot', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ work: canonicalWork() }) });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(result.current.attempt).toEqual({
    status: 'done', outcome: { kind: 'verified', workId: WORK_ID }, cleanupError: false,
  });
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(mutateAsync).toHaveBeenCalledWith({
    clientProfileId: 'brand-a',
    draftKey: DRAFT_ID,
    request: 'Uma peça de lançamento',
    intent: 'single',
    format: '4:5',
    settings: { formatMode: 'auto', targetFormats: [] },
  });
  expect(apiFetch).toHaveBeenCalledWith(`/api/creative-work/${WORK_ID}`);
  expect(memory.drafts.has(DRAFT_ID)).toBe(false);
  expect(memory.receipts.get(DRAFT_ID)?.phase).toBe('verified');
  expect(releaseImportLease).toHaveBeenCalledTimes(1);
});

it('bloqueia clique repetido durante a tentativa', async () => {
  const draft = seedDraft();
  let releaseMutation!: (value: unknown) => void;
  mutateAsync.mockReturnValueOnce(new Promise((resolve) => { releaseMutation = resolve; }));
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ work: canonicalWork() }) });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = result.current.start();
    second = result.current.start();
  });
  expect(result.current.busy).toBe(true);
  await expect(second).resolves.toBeNull();
  expect(claimImportLease).toHaveBeenCalledTimes(1);
  releaseMutation({ work: canonicalWork() });
  await act(async () => { await first; });
  expect(mutateAsync).toHaveBeenCalledTimes(1);
});

it('bloqueia quando o lease está ocupado, sem tocar na rede', async () => {
  const draft = seedDraft();
  memory.claimResult = { kind: 'busy' };
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'lease_busy' });
  expect(mutateAsync).not.toHaveBeenCalled();
  expect(apiFetch).not.toHaveBeenCalled();
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('bloqueia recibo de outro contexto', async () => {
  const draft = seedDraft();
  memory.claimResult = { kind: 'context_mismatch' };
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'receipt_context_mismatch' });
  expect(mutateAsync).not.toHaveBeenCalled();
});

it('bloqueia quando o snapshot mudou antes da tentativa', async () => {
  const draft = seedDraft();
  memory.drafts.set(DRAFT_ID, { ...structuredClone(draft), request: 'Texto editado depois' });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'snapshot_changed' });
  expect(claimImportLease).not.toHaveBeenCalled();
});

it('bloqueia quando a criação devolve carga inválida', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: { id: WORK_ID } });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('bloqueia quando a leitura canônica falha', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue({ ok: false, status: 404 });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('bloqueia quando o recibo não pode ser confirmado', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ work: canonicalWork() }) });
  memory.saveError = new Error('import_receipt_conflict');
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('mantém verificado mesmo quando a limpeza local falha', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ work: canonicalWork() }) });
  memory.removeError = new Error('quota');
  const { result } = renderHook(() => useGuestDraftImport({ draft, context }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(result.current.attempt).toEqual({
    status: 'done', outcome: { kind: 'verified', workId: WORK_ID }, cleanupError: true,
  });
  expect(mutateAsync).toHaveBeenCalledTimes(1);
});

it('projeta createdByUserId somente após validar a carga', () => {
  expect(toCanonicalDraft(canonicalWork())).toEqual({
    userId: 'user-a',
    workspaceId: 'workspace-a',
    clientProfileId: 'brand-a',
    id: WORK_ID,
    draftKey: DRAFT_ID,
    request: 'Uma peça de lançamento',
    intent: 'single',
  });
  expect(() => toCanonicalDraft(null)).toThrow('invalid_canonical_work');
  expect(() => toCanonicalDraft({ ...canonicalWork(), createdByUserId: 42 })).toThrow('invalid_canonical_work');
  expect(() => toCanonicalDraft({ ...canonicalWork(), toolKind: 'hologram' })).toThrow('invalid_canonical_work');
  expect(() => toCanonicalDraft({ ...canonicalWork(), draftKey: 7 })).toThrow('invalid_canonical_work');
});
