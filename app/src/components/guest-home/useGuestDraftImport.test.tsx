import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuestDraftImport } from './useGuestDraftImport';
import type { GuestDraft } from './guest-core.mjs';

const mockMutateAsync = vi.fn();
const mockSourceMutateAsync = vi.fn();
const mockUploadAttachment = vi.fn();
const mockApiFetch = vi.fn();
const mockClaim = vi.fn();
const mockLoadReceipt = vi.fn();
const mockSaveReceipt = vi.fn();
const mockRenew = vi.fn();
const mockRelease = vi.fn();

vi.mock('@/lib/hooks/use-creative-work', () => ({
  useCreateCreativeWorkDraft: () => ({ mutateAsync: (...args: unknown[]) => mockMutateAsync(...args) }),
  useCreativeWorkSourceActions: () => ({ mutateAsync: (...args: unknown[]) => mockSourceMutateAsync(...args) }),
  mapCreativeWorkDetail: (data: { work: unknown; sources?: unknown[] }) => ({
    work: data.work, sources: data.sources ?? [],
  }),
}));
vi.mock('@/lib/assistant/chat-attachments', () => ({
  uploadChatAttachment: (...args: unknown[]) => mockUploadAttachment(...args),
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('./guest-store.mjs', () => ({
  claimImportLease: (...args: unknown[]) => mockClaim(...args),
  loadImportReceipt: (...args: unknown[]) => mockLoadReceipt(...args),
  saveImportReceipt: (...args: unknown[]) => mockSaveReceipt(...args),
  renewImportLease: (...args: unknown[]) => mockRenew(...args),
  releaseImportLease: (...args: unknown[]) => mockRelease(...args),
  saveDraft: vi.fn(),
  loadDraft: vi.fn(),
  loadLastDraft: vi.fn(),
  removeDraft: vi.fn(),
  pruneExpiredDrafts: vi.fn(),
}));

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';
const CONTEXT = { userId: 'user-1', workspaceId: 'ws-1', clientProfileId: 'brand-1' };
const DRAFT: GuestDraft = {
  version: 1, id: DRAFT_ID, request: 'Anúncio', intent: 'single', exampleId: null,
  files: [], createdAt: 1789680000000, expiresAt: 1789680000000 + 86400000,
};
const WORK = {
  id: 'work-1', createdByUserId: 'user-1', workspaceId: 'ws-1', clientProfileId: 'brand-1',
  draftKey: DRAFT_ID, request: 'Anúncio', toolKind: 'single',
  updatedAt: '2026-09-18T00:00:00.000Z',
};
const FILE = new File(['bytes'], 'ref.png', { type: 'image/png' });
const DRAFT_WITH_FILE = { ...DRAFT, files: [FILE] };

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useGuestDraftImport', () => {
  const receiptStore = new Map<string, unknown>();

  beforeEach(() => {
    receiptStore.clear();
    vi.restoreAllMocks();
    receiptStore.clear();
    mockLoadReceipt.mockReset().mockImplementation(async (id: string) => receiptStore.get(id) ?? null);
    mockSaveReceipt.mockReset().mockImplementation(async (receipt: { guestDraftId: string }) => {
      receiptStore.set(receipt.guestDraftId, structuredClone(receipt));
    });
    mockMutateAsync.mockReset().mockResolvedValue({ work: WORK });
    mockSourceMutateAsync.mockReset().mockResolvedValue({ source: { id: 'source-1' } });
    mockUploadAttachment.mockReset().mockResolvedValue({ assetId: 'asset-1' });
    mockApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ work: WORK }) });
    mockClaim.mockReset().mockResolvedValue({ kind: 'acquired', receipt: { revision: 1 } });
    mockRenew.mockReset().mockResolvedValue(true);
    mockRelease.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reivindica, cria, verifica, salva recibo e libera o lease', async () => {
    const { result } = renderHook(() => useGuestDraftImport(true), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.importDraft({ draft: DRAFT, context: CONTEXT });
    });
    expect(outcome).toEqual({ kind: 'verified', workId: 'work-1' });
    expect(mockClaim).toHaveBeenCalledWith(DRAFT_ID, CONTEXT, expect.any(String), expect.any(Number));
    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      draftKey: DRAFT_ID, request: 'Anúncio', clientProfileId: 'brand-1',
    }));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/creative-work/work-1');
    expect(mockSaveReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ guestDraftId: DRAFT_ID, workId: 'work-1', phase: 'verified' }), 0);
    expect(mockRelease).toHaveBeenCalledWith(DRAFT_ID, expect.any(String));
    const claimOrder = mockClaim.mock.invocationCallOrder[0];
    const releaseOrder = mockRelease.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(releaseOrder);
  });

  it('lease ocupado bloqueia sem tocar na rede', async () => {
    mockClaim.mockResolvedValue({ kind: 'busy' });
    const { result } = renderHook(() => useGuestDraftImport(true), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.importDraft({ draft: DRAFT, context: CONTEXT });
    });
    expect(outcome).toEqual({ kind: 'blocked', code: 'lease_busy' });
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('renova o lease durante a importação e libera mesmo em erro', async () => {
    vi.useFakeTimers();
    let releaseCreate!: (value: unknown) => void;
    mockMutateAsync.mockImplementation(() => new Promise((resolve) => { releaseCreate = resolve; }));
    const { result } = renderHook(() => useGuestDraftImport(true), { wrapper });
    let outcome: unknown;
    let failed: unknown;
    const importAct = act(async () => {
      try {
        outcome = await result.current.importDraft({ draft: DRAFT, context: CONTEXT });
      } catch (error) {
        failed = error;
      }
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mockRenew).toHaveBeenCalledWith(DRAFT_ID, expect.any(String), expect.any(Number));
    await act(async () => {
      releaseCreate({ work: WORK });
      await vi.advanceTimersByTimeAsync(0);
    });
    await importAct;
    expect(outcome).toEqual({ kind: 'verified', workId: 'work-1' });
    expect(failed).toBeUndefined();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('transfere referências após o texto verificado', async () => {
    const reads = [
      { work: WORK },
      { work: WORK, sources: [] },
      { work: WORK, sources: [{ id: 'source-1', assetId: 'asset-1' }] },
    ];
    mockApiFetch.mockImplementation(async () => ({
      ok: true, json: async () => reads.shift() ?? { work: WORK, sources: [] },
    }));
    const { result } = renderHook(() => useGuestDraftImport(true), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.importDraft({ draft: DRAFT_WITH_FILE, context: CONTEXT });
    });
    expect(outcome).toEqual({ kind: 'verified', workId: 'work-1' });
    expect(mockUploadAttachment).toHaveBeenCalledWith(FILE);
    expect(mockSourceMutateAsync).toHaveBeenCalledWith({
      workItemId: 'work-1', action: 'attachSource', assetId: 'asset-1',
      usage: 'content', expectedUpdatedAt: expect.any(String),
    });
  });

  it('anexos desligados bloqueiam transferência sem enviar bytes', async () => {
    const { result } = renderHook(() => useGuestDraftImport(false), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.importDraft({ draft: DRAFT_WITH_FILE, context: CONTEXT });
    });
    expect(outcome).toEqual({ kind: 'blocked', code: 'attachments_disabled' });
    expect(mockUploadAttachment).not.toHaveBeenCalled();
    expect(mockSourceMutateAsync).not.toHaveBeenCalled();
  });

  it('texto explícito pula a transferência mesmo com arquivos', async () => {
    const { result } = renderHook(() => useGuestDraftImport(true), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.importDraft({ draft: DRAFT_WITH_FILE, context: CONTEXT, textOnly: true });
    });
    expect(outcome).toEqual({ kind: 'verified', workId: 'work-1' });
    expect(mockUploadAttachment).not.toHaveBeenCalled();
    expect(mockSourceMutateAsync).not.toHaveBeenCalled();
  });
});
