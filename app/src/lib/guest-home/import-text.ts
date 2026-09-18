import type {
  CanonicalDraft, ImportContext, ImportOutcome, TextImportInput, TextImportPorts,
} from './import-contracts';

function sameContext(left: ImportContext, right: ImportContext) {
  return left.userId === right.userId && left.workspaceId === right.workspaceId
    && left.clientProfileId === right.clientProfileId;
}

function identityMatches(work: CanonicalDraft, input: TextImportInput) {
  return sameContext(work, input.context) && work.draftKey === input.draft.id;
}

export async function ensureCanonicalGuestDraft(
  input: TextImportInput, ports: TextImportPorts,
): Promise<ImportOutcome> {
  const { draft, context } = input;
  try {
    const receipt = await ports.loadReceipt(draft.id);
    if (!receipt || !sameContext(receipt, context))
      return { kind: 'blocked', code: 'receipt_context_mismatch' };
    const work = receipt.workId ? await ports.readWork(receipt.workId)
      : await ports.createDraft({
        clientProfileId: context.clientProfileId, draftKey: draft.id,
        request: draft.request, intent: draft.intent, format: '4:5',
        settings: { formatMode: 'auto', targetFormats:
          draft.intent === 'format_adaptation' ? ['1:1', '9:16'] : [] },
      });
    if (!identityMatches(work, input))
      return { kind: 'blocked', code: 'work_context_mismatch' };
    await ports.saveReceipt({ ...receipt, workId: work.id, phase: 'created' });
    const canonical = await ports.readWork(work.id);
    if (!identityMatches(canonical, input))
      return { kind: 'blocked', code: 'work_context_mismatch' };
    if (canonical.request !== draft.request || canonical.intent !== draft.intent)
      return { kind: 'existing_changed', workId: canonical.id };
    if (draft.files.length > 0) return {
      kind: 'partial', workId: canonical.id,
      pendingFileIds: draft.files.map((_, index) => `${draft.id}:${index}`),
    };
    // Recarregar recibo: o store pode ter avançado sua revisão no save anterior.
    const current = await ports.loadReceipt(draft.id);
    if (!current || !sameContext(current, context))
      return { kind: 'blocked', code: 'receipt_context_mismatch' };
    await ports.saveReceipt({ ...current, workId: canonical.id, phase: 'verified' });
    return { kind: 'verified', workId: canonical.id };
  } catch {
    return { kind: 'blocked', code: 'transfer_not_confirmed' };
  }
}
