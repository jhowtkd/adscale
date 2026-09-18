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

export type TextImportInput = { draft: GuestDraft; context: ImportContext; textOnly?: boolean };

/** Upload was sent but the outcome is unknown (timeout, dropped response). Retryable, never declared failed. */
export class ReferenceUploadUnknown extends Error {
  constructor() {
    super('upload_unknown');
    this.name = 'ReferenceUploadUnknown';
  }
}

export type SourceSnapshot = {
  sources: { id: string; assetId: string | null }[];
  updatedAt: string;
};

export type ReferenceImportPorts = {
  loadReceipt(id: string): Promise<GuestImportReceipt | null>;
  saveReceipt(receipt: GuestImportReceipt): Promise<void>;
  uploadFile(file: File): Promise<{ assetId: string }>;
  attachSource(input: {
    workItemId: string; assetId: string; expectedUpdatedAt: string;
  }): Promise<{ sourceId: string }>;
  readSources(workItemId: string): Promise<SourceSnapshot>;
};

export type ReferenceImportInput = { draft: GuestDraft; workId: string; context: ImportContext };
