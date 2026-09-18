import { expect, it } from 'vitest';
import type {
  GuestImportReceipt,
  ImportContext,
} from '@/lib/guest-home/import-contracts';
import {
  IMPORT_LEASE_TTL_MS,
  parseImportReceipt,
  planImportClaim,
  planImportSave,
  planLeaseRelease,
  planLeaseRenewal,
} from './guest-store.mjs';

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';
const NOW = 1_780_000_000_000;

const context: ImportContext = { userId: 'user-a', workspaceId: 'workspace-a', clientProfileId: 'brand-a' };

function snapshot(expiresAt = NOW + 3_600_000, fileCount = 2) {
  return {
    id: DRAFT_ID,
    expiresAt,
    files: Array.from({ length: fileCount }, () => ({})) as unknown as File[],
  };
}

function receipt(overrides: Partial<GuestImportReceipt> = {}): GuestImportReceipt {
  return {
    ...context,
    guestDraftId: DRAFT_ID,
    workId: null,
    phase: 'claimed',
    references: [],
    expiresAt: NOW + 3_600_000,
    revision: 1,
    leaseOwner: 'owner-a',
    leaseExpiresAt: NOW + IMPORT_LEASE_TTL_MS,
    ...overrides,
  };
}

it('vincula a primeira aquisição à expiração original e a referências pendentes', () => {
  const snap = snapshot(NOW + 5_000);
  const decision = planImportClaim(null, snap, context, 'owner-a', NOW);
  expect(decision.kind).toBe('acquired');
  if (decision.kind !== 'acquired') throw new Error('unreachable');
  expect(decision.receipt).toEqual({
    ...context,
    guestDraftId: DRAFT_ID,
    workId: null,
    phase: 'claimed',
    references: [
      { fileId: `${DRAFT_ID}:0`, assetId: null, sourceId: null, state: 'pending' },
      { fileId: `${DRAFT_ID}:1`, assetId: null, sourceId: null, state: 'pending' },
    ],
    expiresAt: NOW + 5_000,
    revision: 1,
    leaseOwner: 'owner-a',
    leaseExpiresAt: NOW + 120_000,
  });
});

it('impede aquisição nova sem snapshot', () => {
  expect(planImportClaim(null, null, context, 'owner-a', NOW)).toEqual({ kind: 'unavailable' });
});

it('não permite que outro contexto assuma um recibo existente', () => {
  const other = { ...context, clientProfileId: 'brand-other' };
  expect(planImportClaim(receipt(), snapshot(), other, 'owner-b', NOW)).toEqual({ kind: 'context_mismatch' });
  expect(planImportClaim(receipt(), null, other, 'owner-b', NOW)).toEqual({ kind: 'context_mismatch' });
});

it('reporta ocupado quando outra aba detém o lease', () => {
  const stored = receipt({ leaseOwner: 'owner-b', leaseExpiresAt: NOW + 60_000 });
  expect(planImportClaim(stored, snapshot(), context, 'owner-a', NOW)).toEqual({ kind: 'busy' });
});

it('permite assumir o lease expirado avançando a revisão', () => {
  const stored = receipt({ leaseOwner: 'owner-b', leaseExpiresAt: NOW - 1, revision: 2 });
  const decision = planImportClaim(stored, snapshot(), context, 'owner-a', NOW);
  expect(decision.kind).toBe('acquired');
  if (decision.kind !== 'acquired') throw new Error('unreachable');
  expect(decision.receipt.revision).toBe(3);
  expect(decision.receipt.leaseOwner).toBe('owner-a');
  expect(decision.receipt.expiresAt).toBe(stored.expiresAt);
});

it('permite reaquisição pelo mesmo dono e recibo verificado do mesmo contexto', () => {
  const same = planImportClaim(receipt(), snapshot(), context, 'owner-a', NOW);
  expect(same.kind).toBe('acquired');
  const verified = planImportClaim(
    receipt({ phase: 'verified', workId: 'bb222222-2222-4222-8222-222222222222', leaseOwner: null, leaseExpiresAt: 0 }),
    null, context, 'owner-a', NOW,
  );
  expect(verified.kind).toBe('acquired');
  if (verified.kind !== 'acquired') throw new Error('unreachable');
  expect(verified.receipt.phase).toBe('verified');
  expect(verified.receipt.workId).toBe('bb222222-2222-4222-8222-222222222222');
});

it('grava condicional por revisão e rejeita revisão antiga', () => {
  const first = planImportSave(null, receipt({ revision: 0 }), 0);
  expect(first.revision).toBe(1);
  const stored = receipt({ revision: 2 });
  const advanced = planImportSave(stored, { ...stored }, 2);
  expect(advanced.revision).toBe(3);
  expect(() => planImportSave(stored, { ...stored, revision: 1 }, 1)).toThrow('import_receipt_conflict');
  expect(() => planImportSave(stored, { ...stored }, 1)).toThrow('import_receipt_conflict');
});

it('renova somente para o dono, sem avançar revisão', () => {
  const stored = receipt({ revision: 2, leaseExpiresAt: NOW + 1_000 });
  const renewed = planLeaseRenewal(stored, 'owner-a', NOW);
  expect(renewed).toEqual({ ...stored, leaseExpiresAt: NOW + 120_000 });
  expect(planLeaseRenewal(stored, 'owner-b', NOW)).toBeNull();
  expect(planLeaseRenewal(null, 'owner-a', NOW)).toBeNull();
  const expired = planLeaseRenewal({ ...stored, leaseExpiresAt: NOW - 1 }, 'owner-a', NOW);
  expect(expired?.leaseExpiresAt).toBe(NOW + 120_000);
});

it('libera somente para o dono', () => {
  const stored = receipt();
  expect(planLeaseRelease(stored, 'owner-a')).toEqual({ ...stored, leaseOwner: null, leaseExpiresAt: 0 });
  expect(planLeaseRelease(stored, 'owner-b')).toBeNull();
  expect(planLeaseRelease(null, 'owner-a')).toBeNull();
});

it('rejeita recibos corrompidos', () => {
  expect(parseImportReceipt(null)).toBeNull();
  expect(parseImportReceipt({ ...receipt(), phase: 'done' })).toBeNull();
  expect(parseImportReceipt({ ...receipt(), guestDraftId: 'x' })).toBeNull();
  expect(parseImportReceipt({ ...receipt(), revision: 0 })).toBeNull();
  expect(parseImportReceipt({ ...receipt(), references: [{ fileId: 'a', state: 'done' }] })).toBeNull();
  expect(parseImportReceipt(receipt())).toEqual(receipt());
});
