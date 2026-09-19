import type {
  GuestImportReceipt, ImportContext, ImportOutcome, ReferenceImportInput, ReferenceImportPorts,
  ReferenceReceipt,
} from './import-contracts';
import { ReferenceUploadUnknown } from './import-contracts';

function fileIdFor(draftId: string, index: number): string {
  return `${draftId}:${index}`;
}

function sameContext(receipt: GuestImportReceipt, context: ImportContext): boolean {
  return receipt.userId === context.userId
    && receipt.workspaceId === context.workspaceId
    && receipt.clientProfileId === context.clientProfileId;
}

function isConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { status?: unknown }).status === 409;
}

function pendingRef(draftId: string, index: number): ReferenceReceipt {
  return { fileId: fileIdFor(draftId, index), assetId: null, sourceId: null, state: 'pending' };
}

/**
 * Serial reference transfer with per-file checkpoints. Stops at the first
 * failure (partial + explicit retry), adopts canonical truth on re-read, and
 * declares verification only after a full re-read confirms every file.
 */
export async function transferGuestReferences(
  input: ReferenceImportInput,
  ports: ReferenceImportPorts,
): Promise<ImportOutcome> {
  const { draft, workId, context } = input;
  const loaded = await ports.loadReceipt(draft.id);
  if (!loaded || loaded.workId !== workId || !sameContext(loaded, context)) {
    return { kind: 'blocked', code: 'context_mismatch' };
  }
  let receipt = loaded;
  const save = async (mutate: (current: GuestImportReceipt) => GuestImportReceipt) => {
    receipt = { ...mutate(receipt), revision: receipt.revision };
    await ports.saveReceipt(receipt);
    receipt = { ...receipt, revision: receipt.revision + 1 };
  };
  const setRef = (fileId: string, patch: Partial<ReferenceReceipt>) => save((current) => ({
    ...current,
    references: current.references.map((ref) => (ref.fileId === fileId ? { ...ref, ...patch } : ref)),
  }));

  if (receipt.references.length !== draft.files.length) {
    await save((current) => ({
      ...current,
      references: draft.files.map((_, index) =>
        current.references.find((ref) => ref.fileId === fileIdFor(draft.id, index))
        ?? pendingRef(draft.id, index)),
    }));
  }

  const attachWithRetry = async (fileId: string, assetId: string, expectedUpdatedAt: string, retriesLeft: number): Promise<'attached' | 'stop'> => {
    try {
      const attached = await ports.attachSource({ workItemId: workId, assetId, expectedUpdatedAt });
      await setRef(fileId, { sourceId: attached.sourceId, state: 'attached' });
      return 'attached';
    } catch (error) {
      if (!isConflict(error) || retriesLeft <= 0) return 'stop';
      const snapshot = await ports.readSources(workId);
      const found = snapshot.sources.find((source) => source.assetId === assetId);
      if (found) {
        await setRef(fileId, { sourceId: found.id, state: 'attached' });
        return 'attached';
      }
      return attachWithRetry(fileId, assetId, snapshot.updatedAt, retriesLeft - 1);
    }
  };

  const ensureAttached = async (fileId: string, assetId: string): Promise<'attached' | 'stop'> => {
    const snapshot = await ports.readSources(workId);
    const found = snapshot.sources.find((source) => source.assetId === assetId);
    if (found) {
      await setRef(fileId, { sourceId: found.id, state: 'attached' });
      return 'attached';
    }
    await setRef(fileId, { assetId, state: 'attaching' });
    return attachWithRetry(fileId, assetId, snapshot.updatedAt, 1);
  };

  for (const [index, file] of draft.files.entries()) {
    const fileId = fileIdFor(draft.id, index);
    const ref = receipt.references.find((entry) => entry.fileId === fileId);
    if (ref?.state === 'attached') continue;
    if (ref?.assetId) {
      if ((await ensureAttached(fileId, ref.assetId)) === 'stop') break;
      continue;
    }
    await setRef(fileId, { state: 'uploading' });
    let assetId: string;
    try {
      ({ assetId } = await ports.uploadFile(file));
    } catch (error) {
      await setRef(fileId, { state: error instanceof ReferenceUploadUnknown ? 'uncertain' : 'pending' });
      break;
    }
    await setRef(fileId, { assetId, state: 'uploaded' });
    if ((await ensureAttached(fileId, assetId)) === 'stop') break;
  }

  const snapshot = await ports.readSources(workId);
  const attachedAssets = new Set(snapshot.sources.map((source) => source.assetId));
  const pendingFileIds = receipt.references
    .filter((ref) => ref.state !== 'attached' || (ref.assetId && !attachedAssets.has(ref.assetId)))
    .map((ref) => ref.fileId);
  // Adopt anything the canonical list confirms that the receipt missed.
  for (const ref of receipt.references.filter((entry) => entry.state !== 'attached' && entry.assetId)) {
    const found = snapshot.sources.find((source) => source.assetId === ref.assetId);
    if (found && pendingFileIds.includes(ref.fileId)) {
      // Keep the receipt honest without changing the outcome of this run.
      await setRef(ref.fileId, { sourceId: found.id, state: 'attached' });
      pendingFileIds.splice(pendingFileIds.indexOf(ref.fileId), 1);
    }
  }
  if (pendingFileIds.length === 0) return { kind: 'verified', workId };
  return { kind: 'partial', workId, pendingFileIds };
}
