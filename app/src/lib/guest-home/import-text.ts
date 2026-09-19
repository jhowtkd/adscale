import type {
  CanonicalDraft, CreateTextDraftInput, GuestImportReceipt, ImportContext, ImportOutcome,
  TextImportInput, TextImportPorts,
} from './import-contracts';
import type { GuestDraft } from '@/components/guest-home/guest-core.mjs';

export function buildTextDraftInput(draft: GuestDraft, context: ImportContext): CreateTextDraftInput {
  return {
    clientProfileId: context.clientProfileId,
    draftKey: draft.id,
    request: draft.request,
    intent: draft.intent,
    format: '4:5',
    settings: { formatMode: 'auto', targetFormats: ['1:1', '9:16'] },
  };
}

function sameContext(receipt: GuestImportReceipt, context: ImportContext): boolean {
  return receipt.userId === context.userId
    && receipt.workspaceId === context.workspaceId
    && receipt.clientProfileId === context.clientProfileId;
}

function identityMatches(work: CanonicalDraft, context: ImportContext, draftKey: string): boolean {
  return work.userId === context.userId
    && work.workspaceId === context.workspaceId
    && work.clientProfileId === context.clientProfileId
    && work.draftKey === draftKey;
}

function contentChanged(work: CanonicalDraft, draft: GuestDraft): boolean {
  return work.request !== draft.request || work.intent !== draft.intent;
}

/**
 * Text-only import: idempotent by draft key, verified by canonical re-read.
 * Never prepares, generates, bills, or overwrites existing content.
 */
export async function ensureCanonicalGuestDraft(
  input: TextImportInput,
  ports: TextImportPorts,
): Promise<ImportOutcome> {
  const { draft, context } = input;
  const receipt = await ports.loadReceipt(draft.id);
  if (receipt && !sameContext(receipt, context)) {
    return { kind: 'blocked', code: 'context_mismatch' };
  }
  if (receipt?.workId && receipt.phase === 'verified') {
    const work = await ports.readWork(receipt.workId);
    if (!identityMatches(work, context, draft.id)) {
      return { kind: 'blocked', code: 'context_mismatch' };
    }
    return contentChanged(work, draft)
      ? { kind: 'existing_changed', workId: work.id }
      : { kind: 'verified', workId: work.id };
  }

  let created: CanonicalDraft;
  try {
    created = await ports.createDraft(buildTextDraftInput(draft, context));
  } catch (error) {
    // The server may have committed while the response was lost. Recover
    // by draft key instead of failing or duplicating (matrix I03).
    const recovered = await ports.readByDraftKey(draft.id);
    if (!recovered) throw error;
    if (!identityMatches(recovered, context, draft.id)) {
      return { kind: 'blocked', code: 'context_mismatch' };
    }
    created = recovered;
  }
  const work = await ports.readWork(created.id);
  if (!identityMatches(work, context, draft.id)) {
    return { kind: 'blocked', code: 'context_mismatch' };
  }
  const next: GuestImportReceipt = {
    ...(receipt ?? {
      ...context,
      guestDraftId: draft.id,
      phase: 'claimed' as const,
      references: [],
      expiresAt: draft.expiresAt,
      leaseOwner: null,
      leaseExpiresAt: 0,
    }),
    workId: work.id,
    phase: 'verified',
    revision: receipt ? receipt.revision : 0,
  };
  await ports.saveReceipt(next);
  return contentChanged(work, draft)
    ? { kind: 'existing_changed', workId: work.id }
    : { kind: 'verified', workId: work.id };
}
