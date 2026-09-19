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
  leaseTakeover: false,
}));

vi.mock('@/components/guest-home/guest-store.mjs', () => {
  const clone = <T,>(value: T): T => structuredClone(value);
  // Drafts carry File handles: structuredClone would mangle jsdom Files, so
  // copy the envelope and share the immutable file references instead.
  const cloneDraft = (value: unknown) => {
    if (!value || typeof value !== 'object') return null;
    const draft = value as { files?: unknown };
    return { ...draft, files: Array.isArray(draft.files) ? [...draft.files] : draft.files };
  };
  return {
    loadDraft: vi.fn(async (id: string) => cloneDraft(memory.drafts.get(id) ?? null)),
    removeDraft: vi.fn(async (id: string) => {
      if (memory.removeError) throw memory.removeError;
      memory.drafts.delete(id);
    }),
    loadImportReceipt: vi.fn(async (id: string) => {
      const receipt = clone(memory.receipts.get(id) ?? null);
      if (receipt && memory.leaseTakeover) receipt.leaseOwner = 'intruder';
      return receipt;
    }),
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
      const snapshot = memory.drafts.get(id) as { expiresAt: number; files: unknown[] } | undefined;
      if (!stored && !snapshot) return { kind: 'unavailable' };
      const pending = (snapshot?.files ?? []).map((_, index) => ({
        fileId: `${id}:${index}`, assetId: null, sourceId: null, state: 'pending' as const,
      }));
      const next: GuestImportReceipt = {
        ...claimContext,
        guestDraftId: id,
        workId: stored?.workId ?? null,
        phase: stored?.phase ?? 'claimed',
        references: stored ? clone(stored.references) : pending,
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
const mutateSourceAsync = vi.hoisted(() => vi.fn());
vi.mock('@/lib/hooks/use-creative-work', () => ({
  useCreateCreativeWorkDraft: () => ({ mutateAsync }),
  useCreativeWorkSourceActions: () => ({ mutateAsync: mutateSourceAsync }),
}));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch }));

const uploadChatAttachment = vi.hoisted(() => vi.fn());
vi.mock('@/lib/assistant/chat-attachments', () => ({ uploadChatAttachment }));

const recordEvent = vi.hoisted(() => vi.fn());
vi.mock('@/lib/hooks/use-record-beta-event', () => ({
  useRecordBetaEvent: () => ({ recordEvent }),
}));

const uploadConfig = vi.hoisted(() => ({
  isAllowedImageType: vi.fn(() => true),
  validateImageMagicBytes: vi.fn(async () => true),
}));
vi.mock('@/lib/upload-config', () => ({
  isAllowedImageType: (...args: unknown[]) =>
    uploadConfig.isAllowedImageType(...(args as [string])),
  validateImageMagicBytes: (...args: unknown[]) =>
    uploadConfig.validateImageMagicBytes(...(args as [File, string])),
}));

import { useGuestDraftImport, toCanonicalDraft, toReferenceWork } from './useGuestDraftImport';
import {
  claimImportLease,
  loadDraft,
  releaseImportLease,
  removeDraft,
} from '@/components/guest-home/guest-store.mjs';

function seedDraft(files: File[] = []) {
  const draft = createDraft({ request: 'Uma peça de lançamento', intent: 'single', files }, DRAFT_ID);
  memory.drafts.set(DRAFT_ID, { ...draft, files: [...draft.files] });
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
    updatedAt: '2026-09-18T20:00:01.000Z',
    ...overrides,
  };
}

function detailResponse(sources: unknown[] = []) {
  return { ok: true, json: async () => ({ work: canonicalWork(), sources }) };
}

beforeEach(() => {
  memory.drafts.clear();
  memory.receipts.clear();
  memory.claimResult = null;
  memory.saveError = null;
  memory.removeError = null;
  memory.leaseTakeover = false;
  mutateAsync.mockReset();
  mutateSourceAsync.mockReset();
  uploadChatAttachment.mockReset();
  recordEvent.mockReset();
  apiFetch.mockReset();
  mutateSourceAsync.mockResolvedValue({ source: { id: 'source-1' } });
  vi.mocked(loadDraft).mockClear();
  vi.mocked(claimImportLease).mockClear();
  vi.mocked(removeDraft).mockClear();
  vi.mocked(releaseImportLease).mockClear();
});

it('começa ocioso e ignora tentativa sem pedido ou contexto', async () => {
  const { result } = renderHook(() => useGuestDraftImport({ draft: null, context, attachmentsEnabled: true }));
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
  apiFetch.mockResolvedValue(detailResponse());
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
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
  expect(recordEvent).toHaveBeenCalledTimes(1);
  expect(recordEvent).toHaveBeenCalledWith('guest_draft_imported', {
    creativeWorkId: WORK_ID,
    protocol: 'single',
    referenceCount: 0,
    recovered: false,
  });
});

it('bloqueia clique repetido durante a tentativa', async () => {
  const draft = seedDraft();
  let releaseMutation!: (value: unknown) => void;
  mutateAsync.mockReturnValueOnce(new Promise((resolve) => { releaseMutation = resolve; }));
  apiFetch.mockResolvedValue(detailResponse());
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
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
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
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
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'receipt_context_mismatch' });
  expect(mutateAsync).not.toHaveBeenCalled();
});

it('bloqueia quando o snapshot mudou antes da tentativa', async () => {
  const draft = seedDraft();
  memory.drafts.set(DRAFT_ID, { ...structuredClone(draft), request: 'Texto editado depois' });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'snapshot_changed' });
  expect(claimImportLease).not.toHaveBeenCalled();
});

it('bloqueia quando a criação devolve carga inválida', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: { id: WORK_ID } });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('bloqueia quando a leitura canônica falha', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue({ ok: false, status: 404 });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('bloqueia quando o recibo não pode ser confirmado', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue(detailResponse());
  memory.saveError = new Error('import_receipt_conflict');
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('mantém verificado mesmo quando a limpeza local falha', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue(detailResponse());
  memory.removeError = new Error('quota');
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
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

it('valida o agregado de trabalho e fontes antes das referências', () => {
  expect(toReferenceWork({ work: canonicalWork(), sources: [] })).toEqual({
    work: { ...toCanonicalDraft(canonicalWork()), updatedAt: '2026-09-18T20:00:01.000Z' },
    sources: [],
  });
  const source = { id: 'source-1', assetId: 'asset-1', status: 'analyzing' };
  expect(toReferenceWork({ work: canonicalWork(), sources: [source] }).sources).toEqual([source]);
  expect(() => toReferenceWork(null)).toThrow('invalid_reference_work');
  expect(() => toReferenceWork({ work: canonicalWork() })).toThrow('invalid_reference_work');
  expect(() => toReferenceWork({ work: { ...canonicalWork(), updatedAt: '' }, sources: [] }))
    .toThrow('invalid_reference_work');
  expect(() => toReferenceWork({ work: canonicalWork(), sources: [{ id: 's', assetId: 'a', status: 'pronto' }] }))
    .toThrow('invalid_reference_work');
});

it('transfere texto e referências no mesmo clique, sob o mesmo lease', async () => {
  const file = new File([new Uint8Array([1])], 'ref.png', { type: 'image/png' });
  const draft = seedDraft([file]);
  const liveSources: unknown[] = [];
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockImplementation(async () => ({
    ok: true, json: async () => ({ work: canonicalWork(), sources: structuredClone(liveSources) }),
  }));
  uploadChatAttachment.mockResolvedValue({ assetId: 'asset-1', key: 'k', type: 'image/png', name: 'ref.png', size: 1 });
  mutateSourceAsync.mockImplementation(async (action: { assetId: string }) => {
    liveSources.push({ id: 'source-1', assetId: action.assetId, status: 'uploaded' });
    return { source: { id: 'source-1' } };
  });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(uploadChatAttachment).toHaveBeenCalledTimes(1);
  expect(uploadChatAttachment).toHaveBeenCalledWith(expect.objectContaining({ name: 'ref.png' }));
  expect(mutateSourceAsync).toHaveBeenCalledTimes(1);
  expect(mutateSourceAsync).toHaveBeenCalledWith({
    workItemId: WORK_ID,
    action: 'attachSource',
    assetId: 'asset-1',
    usage: 'both',
    expectedUpdatedAt: '2026-09-18T20:00:01.000Z',
  });
  // Text read (canonical check) + reference reads (initial, post-upload,
  // post-attach, final): serial, no optimistic cache.
  expect(apiFetch).toHaveBeenCalledTimes(5);
  expect(claimImportLease).toHaveBeenCalledTimes(1);
  expect(memory.drafts.has(DRAFT_ID)).toBe(false);
  expect(memory.receipts.get(DRAFT_ID)?.phase).toBe('verified');
  expect(recordEvent).toHaveBeenCalledWith('guest_draft_imported', {
    creativeWorkId: WORK_ID,
    protocol: 'single',
    referenceCount: 1,
    recovered: false,
  });
});

it('anexos desligados retornam parcial sem transferir', async () => {
  const file = new File([new Uint8Array([1])], 'ref.png', { type: 'image/png' });
  const draft = seedDraft([file]);
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue(detailResponse());
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: false }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'partial', workId: WORK_ID, pendingFileIds: [`${DRAFT_ID}:0`] });
  expect(uploadChatAttachment).not.toHaveBeenCalled();
  expect(mutateSourceAsync).not.toHaveBeenCalled();
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('retry incerto explícito conclui o envio perdido sem recriar o Trabalho', async () => {
  const file = new File([new Uint8Array([1])], 'ref.png', { type: 'image/png' });
  const draft = seedDraft([file]);
  const liveSources: unknown[] = [];
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockImplementation(async () => ({
    ok: true, json: async () => ({ work: canonicalWork(), sources: structuredClone(liveSources) }),
  }));
  mutateSourceAsync.mockImplementation(async (action: { assetId: string }) => {
    liveSources.push({ id: 'source-1', assetId: action.assetId, status: 'uploaded' });
    return { source: { id: 'source-1' } };
  });
  uploadChatAttachment.mockRejectedValueOnce(new Error('network'));
  uploadChatAttachment.mockResolvedValue({ assetId: 'asset-9', key: 'k', type: 'image/png', name: 'ref.png', size: 1 });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let first: unknown;
  await act(async () => { first = await result.current.start(); });
  expect(first).toEqual({ kind: 'partial', workId: WORK_ID, pendingFileIds: [`${DRAFT_ID}:0`] });
  expect(uploadChatAttachment).toHaveBeenCalledTimes(1);

  let second: unknown;
  await act(async () => { second = await result.current.start(); });
  expect(second).toEqual({ kind: 'partial', workId: WORK_ID, pendingFileIds: [`${DRAFT_ID}:0`] });
  expect(uploadChatAttachment).toHaveBeenCalledTimes(1);

  let third: unknown;
  await act(async () => { third = await result.current.start({ retryUncertainUpload: true }); });
  expect(third).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(uploadChatAttachment).toHaveBeenCalledTimes(2);
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(liveSources).toHaveLength(1);
});

it('attach usa a revisão lida logo antes de associar', async () => {
  const file = new File([new Uint8Array([1])], 'ref.png', { type: 'image/png' });
  const draft = seedDraft([file]);
  const liveSources: unknown[] = [];
  let reads = 0;
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockImplementation(async () => {
    reads += 1;
    const work = canonicalWork({ updatedAt: `2026-09-18T20:00:0${reads}.000Z` });
    return { ok: true, json: async () => ({ work, sources: structuredClone(liveSources) }) };
  });
  uploadChatAttachment.mockResolvedValue({ assetId: 'asset-1', key: 'k', type: 'image/png', name: 'ref.png', size: 1 });
  mutateSourceAsync.mockImplementation(async (action: { assetId: string }) => {
    liveSources.push({ id: 'source-1', assetId: action.assetId, status: 'uploaded' });
    return { source: { id: 'source-1' } };
  });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  await act(async () => { await result.current.start(); });
  // Third read is the post-upload revision, immediately before the attach
  // (text contributes one read; the second text read only runs without files).
  expect(mutateSourceAsync).toHaveBeenCalledWith(expect.objectContaining({
    expectedUpdatedAt: '2026-09-18T20:00:03.000Z',
  }));
});

it('arquivo corrompido bloqueia antes de qualquer envio', async () => {
  const file = new File([new Uint8Array([1])], 'ref.png', { type: 'image/png' });
  const draft = seedDraft([file]);
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue(detailResponse());
  uploadConfig.validateImageMagicBytes.mockResolvedValueOnce(false);
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'invalid_reference' });
  expect(uploadChatAttachment).not.toHaveBeenCalled();
  expect(mutateSourceAsync).not.toHaveBeenCalled();
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});

it('marca recovered quando o recibo já traz o Trabalho', async () => {
  const draft = seedDraft();
  memory.receipts.set(DRAFT_ID, {
    ...context,
    guestDraftId: DRAFT_ID,
    workId: WORK_ID,
    phase: 'created',
    references: [],
    expiresAt: Date.now() + 60_000,
    revision: 2,
    leaseOwner: null,
    leaseExpiresAt: 0,
  });
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue(detailResponse());
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(mutateAsync).not.toHaveBeenCalled();
  expect(recordEvent).toHaveBeenCalledWith('guest_draft_imported', expect.objectContaining({
    recovered: true,
  }));
});

it('falha de analytics não bloqueia a importação verificada', async () => {
  const draft = seedDraft();
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue(detailResponse());
  recordEvent.mockImplementationOnce(() => { throw new Error('beacon down'); });
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(memory.drafts.has(DRAFT_ID)).toBe(false);
});

it('não emite antes da verificação', async () => {
  const file = new File([new Uint8Array([1])], 'ref.png', { type: 'image/png' });
  const draft = seedDraft([file]);
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue(detailResponse());
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: false }));
  await act(async () => { await result.current.start(); });
  expect(recordEvent).not.toHaveBeenCalled();
  memory.claimResult = { kind: 'busy' };
  const blocked = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  await act(async () => { await blocked.result.current.start(); });
  expect(recordEvent).not.toHaveBeenCalled();
});

it('perda de lease no meio das referências bloqueia sem avançar', async () => {
  const file = new File([new Uint8Array([1])], 'ref.png', { type: 'image/png' });
  const draft = seedDraft([file]);
  mutateAsync.mockResolvedValue({ work: canonicalWork() });
  apiFetch.mockResolvedValue(detailResponse());
  memory.leaseTakeover = true;
  const { result } = renderHook(() => useGuestDraftImport({ draft, context, attachmentsEnabled: true }));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.start(); });
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
  expect(memory.drafts.has(DRAFT_ID)).toBe(true);
});
