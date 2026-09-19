import type { GuestDraft, Intent } from '@/components/guest-home/guest-core.mjs';
import type { CreativeWorkItem } from '@/lib/hooks/use-creative-work';

export type ImportContext = {
  userId: string;
  workspaceId: string;
  clientProfileId: string;
};
export type ReferenceReceipt = {
  fileId: string;
  assetId: string | null;
  sourceId: string | null;
  state: 'pending' | 'uploading' | 'uploaded' | 'attaching' | 'attached' | 'uncertain';
};
export type GuestImportReceipt = ImportContext & {
  guestDraftId: string;
  workId: string | null;
  phase: 'claimed' | 'created' | 'transferring' | 'partial' | 'verified';
  references: ReferenceReceipt[];
  expiresAt: number;
  revision: number;
  leaseOwner: string | null;
  leaseExpiresAt: number;
};
export type CanonicalDraft = ImportContext & {
  id: string;
  draftKey: string | null;
  request: string;
  intent: CreativeWorkItem['toolKind'];
};
export type CreateTextDraftInput = {
  clientProfileId: string;
  draftKey: string;
  request: string;
  intent: Intent;
  format: '4:5';
  settings: {
    formatMode: 'auto';
    targetFormats: Array<'1:1' | '9:16'>;
  };
};
export type ImportOutcome =
  | { kind: 'verified'; workId: string }
  | { kind: 'existing_changed'; workId: string }
  | { kind: 'partial'; workId: string; pendingFileIds: string[] }
  | { kind: 'blocked'; code: string; workId?: string };
export type TextImportPorts = {
  loadReceipt(id: string): Promise<GuestImportReceipt | null>;
  saveReceipt(receipt: GuestImportReceipt): Promise<void>;
  createDraft(input: CreateTextDraftInput): Promise<CanonicalDraft>;
  readWork(id: string): Promise<CanonicalDraft>;
};
export type TextImportInput = { draft: GuestDraft; context: ImportContext };
export type GuestSource = {
  id: string; assetId: string | null;
  status: 'uploaded' | 'analyzing' | 'ready' | 'failed';
};
export type ReferenceWork = {
  work: CanonicalDraft & { updatedAt: string };
  sources: GuestSource[];
};
export type ReferenceImportPorts = {
  upload(file: File): Promise<{ assetId: string }>;
  readWork(id: string): Promise<ReferenceWork>;
  attachSource(input: {
    workItemId: string; expectedUpdatedAt: string;
    action: 'attachSource'; assetId: string; usage: 'both';
  }): Promise<unknown>;
  loadReceipt(id: string): Promise<GuestImportReceipt | null>;
  saveReceipt(receipt: GuestImportReceipt): Promise<void>;
};
export type ReferenceImportInput = TextImportInput & {
  workId: string;
  attachmentsEnabled: boolean;
  retryUncertainUpload: boolean;
};
