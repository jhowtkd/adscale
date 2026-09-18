import type { GuestDraft } from './guest-core.mjs';
import type {
  GuestImportReceipt,
  ImportContext,
} from '../../lib/guest-home/import-contracts';

export const IMPORT_LEASE_TTL_MS: number;

export function saveDraft(draft: GuestDraft): Promise<void>;
export function loadDraft(id: string | null): Promise<GuestDraft | null>;
export function loadLastDraft(): Promise<GuestDraft | null>;
export function removeDraft(id: string): Promise<void>;
export function pruneExpiredDrafts(): Promise<void>;

export type ImportLeaseResult =
  | { kind: 'acquired'; receipt: GuestImportReceipt }
  | { kind: 'busy' | 'context_mismatch' | 'unavailable' };

export function parseImportReceipt(raw: unknown): GuestImportReceipt | null;
export function planImportClaim(
  stored: GuestImportReceipt | null,
  snapshot: Pick<GuestDraft, 'id' | 'expiresAt' | 'files'> | null,
  context: ImportContext,
  owner: string,
  now: number,
): ImportLeaseResult;
export function planImportSave(
  stored: GuestImportReceipt | null,
  receipt: GuestImportReceipt,
  expectedRevision: number,
): GuestImportReceipt;
export function planLeaseRenewal(
  stored: GuestImportReceipt | null,
  owner: string,
  now: number,
): GuestImportReceipt | null;
export function planLeaseRelease(
  stored: GuestImportReceipt | null,
  owner: string,
): GuestImportReceipt | null;

export function loadImportReceipt(id: string): Promise<GuestImportReceipt | null>;
export function saveImportReceipt(
  receipt: GuestImportReceipt, expectedRevision: number,
): Promise<GuestImportReceipt>;
export function claimImportLease(
  id: string, context: ImportContext, owner: string, now: number,
): Promise<ImportLeaseResult>;
export function renewImportLease(id: string, owner: string, now: number): Promise<boolean>;
export function releaseImportLease(id: string, owner: string): Promise<void>;
export function pruneExpiredImportReceipts(now?: number): Promise<void>;
