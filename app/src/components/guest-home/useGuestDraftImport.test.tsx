import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuestDraftImport } from './useGuestDraftImport';
import type { GuestDraft } from './guest-core.mjs';

const mockMutateAsync = vi.fn();
const mockApiFetch = vi.fn();
const mockClaim = vi.fn();
const mockLoadReceipt = vi.fn();
const mockSaveReceipt = vi.fn();
const mockRenew = vi.fn();
const mockRelease = vi.fn();

vi.mock('@/lib/hooks/use-creative-work', () => ({
  useCreateCreativeWorkDraft: () => ({ mutateAsync: (...args: unknown[]) => mockMutateAsync(...args) }),
  mapCreativeWorkDetail: (data: { work: unknown }) => ({ work: data.work }),
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
};

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useGuestDraftImport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMutateAsync.mockReset().mockResolvedValue({ work: WORK });
    mockApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ work: WORK }) });
    mockClaim.mockReset().mockResolvedValue({ kind: 'acquired', receipt: { revision: 1 } });
    mockLoadReceipt.mockReset().mockResolvedValue(null);
    mockSaveReceipt.mockReset().mockResolvedValue({ revision: 1 });
    mockRenew.mockReset().mockResolvedValue(true);
    mockRelease.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reivindica, cria, verifica, salva recibo e libera o lease', async () => {
    const { result } = renderHook(() => useGuestDraftImport(), { wrapper });
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
    const { result } = renderHook(() => useGuestDraftImport(), { wrapper });
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
    const { result } = renderHook(() => useGuestDraftImport(), { wrapper });
    let outcome: unknown;
    let failed: unknown;
    void act(async () => {
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
    expect(outcome).toEqual({ kind: 'verified', workId: 'work-1' });
    expect(failed).toBeUndefined();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
