'use client';

import { useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  mapCreativeWorkDetail, useCreateCreativeWorkDraft, useCreativeWorkSourceActions,
  type CreativeDraftInput, type CreativeWorkDraftItem,
} from '@/lib/hooks/use-creative-work';
import { uploadChatAttachment } from '@/lib/assistant/chat-attachments';
import type {
  CanonicalDraft, CreateTextDraftInput, ImportOutcome, ReferenceImportPorts, TextImportInput,
  TextImportPorts,
} from '@/lib/guest-home/import-contracts';
import { ReferenceUploadUnknown } from '@/lib/guest-home/import-contracts';
import { ensureCanonicalGuestDraft } from '@/lib/guest-home/import-text';
import { transferGuestReferences } from '@/lib/guest-home/import-references';
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

const DEFINITE_UPLOAD_FAILURES = ['Tipo de arquivo não suportado', 'Arquivo inválido ou corrompido'];

async function uploadReference(file: File): Promise<{ assetId: string }> {
  try {
    const uploaded = await uploadChatAttachment(file);
    return { assetId: uploaded.assetId };
  } catch (error) {
    // Pre-send validation failures are definite; anything else may have
    // reached the server, so it stays uncertain instead of failed.
    if (error instanceof Error && DEFINITE_UPLOAD_FAILURES.some((known) => error.message.includes(known))) {
      throw error;
    }
    throw new ReferenceUploadUnknown();
  }
}

/**
 * Canonical import behind the guest entry: text first, then references.
 * Claims a local lease before touching the network, renews it while the
 * import runs, and always releases it — the receipt, not the lease, is the
 * source of truth for resume. References transfer only onto a verified
 * text import; anything else returns the text outcome untouched.
 */
export function useGuestDraftImport(attachmentsEnabled: boolean): {
  importDraft: (input: TextImportInput) => Promise<ImportOutcome>;
} {
  const createMutation = useCreateCreativeWorkDraft();
  const sourceActions = useCreativeWorkSourceActions();

  const importDraft = useCallback(async ({ draft, context, textOnly }: TextImportInput): Promise<ImportOutcome> => {
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
      const textPorts: TextImportPorts = {
        loadReceipt: (id) => loadImportReceipt(id),
        saveReceipt: (receipt) => saveImportReceipt(receipt, receipt.revision).then(() => undefined),
        createDraft: async (input) => {
          const created = await createMutation.mutateAsync(toCreateInput(input));
          return toCanonicalDraft(created.work);
        },
        readWork: readCanonicalWork,
      };
      const textOutcome = await ensureCanonicalGuestDraft({ draft, context }, textPorts);
      if (textOutcome.kind !== 'verified' || textOnly || draft.files.length === 0) {
        return textOutcome;
      }
      if (!attachmentsEnabled) {
        return { kind: 'blocked', code: 'attachments_disabled' };
      }
      const readDetail = async (workItemId: string) => {
        const res = await apiFetch(`/api/creative-work/${workItemId}`);
        if (!res.ok) throw new Error('Falha ao ler o trabalho.');
        return mapCreativeWorkDetail(await res.json());
      };
      const referencePorts: ReferenceImportPorts = {
        loadReceipt: (id) => loadImportReceipt(id),
        saveReceipt: (receipt) => saveImportReceipt(receipt, receipt.revision).then(() => undefined),
        uploadFile: uploadReference,
        attachSource: async ({ workItemId, assetId, expectedUpdatedAt }) => {
          const attached = await sourceActions.mutateAsync({
            workItemId, action: 'attachSource', assetId, usage: 'content', expectedUpdatedAt,
          });
          if (!attached.source) throw new Error('Falha ao associar referência.');
          return { sourceId: attached.source.id };
        },
        readSources: async (workItemId) => {
          const detail = await readDetail(workItemId);
          return {
            sources: detail.sources.map((source) => ({ id: source.id, assetId: source.assetId })),
            updatedAt: String(detail.work.updatedAt),
          };
        },
      };
      return await transferGuestReferences(
        { draft, workId: textOutcome.workId, context }, referencePorts);
    } finally {
      clearInterval(renewTimer);
      await releaseImportLease(draft.id, owner);
    }
  }, [attachmentsEnabled, createMutation, sourceActions]);

  return { importDraft };
}
