import type { GuestDraft } from '@/components/guest-home/guest-core.mjs';
import type {
  CanonicalDraft, GuestImportReceipt, ImportContext, TextImportPorts,
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
