'use client';

import { useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  mapCreativeWorkDetail, useCreateCreativeWorkDraft,
  type CreativeDraftInput, type CreativeWorkDraftItem,
} from '@/lib/hooks/use-creative-work';
import type {
  CanonicalDraft, CreateTextDraftInput, ImportOutcome, TextImportInput, TextImportPorts,
} from '@/lib/guest-home/import-contracts';
import { ensureCanonicalGuestDraft } from '@/lib/guest-home/import-text';
import {
  claimImportLease, loadImportReceipt, releaseImportLease, renewImportLease, saveImportReceipt,
} from './guest-store.mjs';

const LEASE_RENEW_MS = 30_000;

function toCanonicalDraft(work: CreativeWorkDraftItem): CanonicalDraft {
  return {
    id: work.id,
    userId: work.createdByUserId,
    workspaceId: work.workspaceId,
    clientProfileId: work.clientProfileId,
    draftKey: work.draftKey,
    request: work.request,
    intent: work.toolKind,
  };
}

async function readCanonicalWork(id: string): Promise<CanonicalDraft> {
  const res = await apiFetch(`/api/creative-work/${id}`);
  if (!res.ok) throw new Error('Falha ao ler o trabalho.');
  return toCanonicalDraft(mapCreativeWorkDetail(await res.json()).work);
}

function toCreateInput(input: CreateTextDraftInput): CreativeDraftInput {
  return {
    clientProfileId: input.clientProfileId,
    draftKey: input.draftKey,
    request: input.request,
    intent: input.intent,
    format: input.format,
    settings: input.settings,
  };
}

/**
 * Canonical text import behind the guest entry. Claims a local lease before
 * touching the network, renews it while the import runs, and always releases
 * it — the receipt, not the lease, is the source of truth for resume.
 */
export function useGuestDraftImport(): {
  importDraft: (input: TextImportInput) => Promise<ImportOutcome>;
} {
  const createMutation = useCreateCreativeWorkDraft();

  const importDraft = useCallback(async ({ draft, context }: TextImportInput): Promise<ImportOutcome> => {
    const owner = crypto.randomUUID();
    const claim = await claimImportLease(draft.id, context, owner, Date.now());
    if (claim.kind !== 'acquired') {
      const code = claim.kind === 'busy' ? 'lease_busy'
        : claim.kind === 'context_mismatch' ? 'context_mismatch' : 'draft_unavailable';
      return { kind: 'blocked', code };
    }
    const renewTimer = setInterval(() => {
      void renewImportLease(draft.id, owner, Date.now());
    }, LEASE_RENEW_MS);
    try {
      const ports: TextImportPorts = {
        loadReceipt: (id) => loadImportReceipt(id),
        saveReceipt: (receipt) => saveImportReceipt(receipt, receipt.revision).then(() => undefined),
        createDraft: async (input) => {
          const created = await createMutation.mutateAsync(toCreateInput(input));
          return toCanonicalDraft(created.work);
        },
        readWork: readCanonicalWork,
      };
      return await ensureCanonicalGuestDraft({ draft, context }, ports);
    } finally {
      clearInterval(renewTimer);
      await releaseImportLease(draft.id, owner);
    }
  }, [createMutation]);

  return { importDraft };
}
