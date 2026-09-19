import type { GuestDraft } from '@/components/guest-home/guest-core.mjs';
import type {
  CanonicalDraft, GuestImportReceipt, GuestSource, ImportContext,
  ReferenceImportPorts, ReferenceWork, TextImportPorts,
} from '@/lib/guest-home/import-contracts';

export function memoryTextImport(draft: GuestDraft, context: ImportContext) {
  const works = new Map<string, CanonicalDraft>();
  let receipt: GuestImportReceipt = {
    ...context, guestDraftId: draft.id, workId: null, phase: 'claimed',
    references: [], expiresAt: draft.expiresAt, revision: 1,
    leaseOwner: 'test-owner', leaseExpiresAt: Date.now() + 120_000,
  };
  let loseNextResponse = false;
  const ports: TextImportPorts = {
    async loadReceipt() { return structuredClone(receipt); },
    async saveReceipt(next) { receipt = structuredClone(next); },
    async createDraft(input) {
      const key = `${context.workspaceId}:${context.userId}:${input.draftKey}`;
      let work = works.get(key);
      if (!work) {
        work = { ...context, id: 'bb222222-2222-4222-8222-222222222222',
          draftKey: input.draftKey, request: input.request, intent: input.intent };
        works.set(key, work);
      }
      if (loseNextResponse) { loseNextResponse = false; throw new Error('network'); }
      return structuredClone(work);
    },
    async readWork(id) {
      const work = [...works.values()].find((item) => item.id === id);
      if (!work) throw new Error('not_found');
      return structuredClone(work);
    },
  };
  return { ports, works, loseResponseOnce: () => { loseNextResponse = true; } };
}

export interface MemoryReferenceBackend {
  ports: ReferenceImportPorts;
  sources: GuestSource[];
  uploads: File[];
  attaches: Array<{ assetId: string; expectedUpdatedAt: string; usage: string }>;
  reads: number;
  receipt: GuestImportReceipt;
  loseUploadResponseOnce(): void;
  loseAttachResponseOnce(): void;
  failUploadNext(error?: unknown): void;
  failAttachNext(error?: unknown): void;
  failSaveNext(error?: unknown): void;
  concealAfterReads(reads: number, assetIds: string[]): void;
}

/**
 * Backend de teste que efetivamente armazena fontes e revisões: uploads criam
 * assets, attaches criam fontes (idempotentes por assetId, como o servidor) e
 * cada leitura observa o agregado atual. Falhas injetáveis para os caminhos
 * de resposta perdida, limite e revisão.
 */
export function memoryReferenceImport(
  draft: GuestDraft, context: ImportContext, workId: string,
): MemoryReferenceBackend {
  const sources: GuestSource[] = [];
  const uploads: File[] = [];
  const attaches: MemoryReferenceBackend['attaches'] = [];
  let reads = 0;
  let revision = 1;
  let assetSeq = 0;
  let sourceSeq = 0;
  let loseUpload = false;
  let loseAttach = false;
  let uploadError: unknown = null;
  let hasUploadError = false;
  let attachError: unknown = null;
  let hasAttachError = false;
  let saveError: unknown = null;
  let hasSaveError = false;
  let concealAfter = Number.POSITIVE_INFINITY;
  let concealed: string[] = [];
  const receipt: GuestImportReceipt = {
    ...context, guestDraftId: draft.id, workId, phase: 'created',
    references: draft.files.map((_, index) => ({
      fileId: `${draft.id}:${index}`, assetId: null, sourceId: null, state: 'pending' as const,
    })),
    expiresAt: draft.expiresAt, revision: 1,
    leaseOwner: 'test-owner', leaseExpiresAt: Date.now() + 120_000,
  };
  const updatedAt = () => `2026-09-18T20:00:${String(revision).padStart(2, '0')}.000Z`;
  const visibleSources = () => structuredClone(
    reads > concealAfter ? sources.filter((s) => !(s.assetId && concealed.includes(s.assetId))) : sources,
  );
  const ports: ReferenceImportPorts = {
    async upload(file) {
      uploads.push(file);
      assetSeq += 1;
      const assetId = `asset-${assetSeq}`;
      if (hasUploadError) { hasUploadError = false; throw uploadError ?? new Error('upload_failed'); }
      // A lost response still created the remote asset; only the answer vanished.
      if (loseUpload) { loseUpload = false; throw new Error('network'); }
      return { assetId };
    },
    async readWork(id) {
      if (id !== workId) throw new Error('not_found');
      reads += 1;
      const work: ReferenceWork = {
        work: {
          ...context, id: workId, draftKey: draft.id,
          request: draft.request, intent: draft.intent, updatedAt: updatedAt(),
        },
        sources: visibleSources(),
      };
      return structuredClone(work);
    },
    async attachSource(input) {
      attaches.push({ assetId: input.assetId, expectedUpdatedAt: input.expectedUpdatedAt, usage: input.usage });
      if (hasAttachError) { hasAttachError = false; throw attachError ?? new Error('attach_rejected'); }
      const existing = sources.find((source) => source.assetId === input.assetId);
      if (!existing) {
        sourceSeq += 1;
        sources.push({ id: `source-${sourceSeq}`, assetId: input.assetId, status: 'uploaded' });
        revision += 1;
      }
      if (loseAttach) { loseAttach = false; throw new Error('network'); }
      return { ok: true };
    },
    async loadReceipt() { return structuredClone(receipt); },
    async saveReceipt(next) {
      if (hasSaveError) { hasSaveError = false; throw saveError ?? new Error('storage-full'); }
      receipt.workId = next.workId;
      receipt.phase = next.phase;
      receipt.references = structuredClone(next.references);
      receipt.revision = next.revision + 1;
    },
  };
  return {
    ports, sources, uploads, attaches, receipt,
    get reads() { return reads; },
    loseUploadResponseOnce: () => { loseUpload = true; },
    loseAttachResponseOnce: () => { loseAttach = true; },
    failUploadNext: (error) => { hasUploadError = true; uploadError = error; },
    failAttachNext: (error) => { hasAttachError = true; attachError = error; },
    failSaveNext: (error) => { hasSaveError = true; saveError = error; },
    concealAfterReads: (count, assetIds) => { concealAfter = count; concealed = assetIds; },
  };
}

