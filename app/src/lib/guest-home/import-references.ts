import { selectFiles } from '@/components/guest-home/guest-core.mjs';
import type {
  GuestImportReceipt,
  GuestSource,
  ImportContext,
  ImportOutcome,
  ReferenceImportInput,
  ReferenceImportPorts,
  ReferenceReceipt,
} from './import-contracts';

export function pendingReferenceIds(
  references: ReferenceReceipt[], sources: GuestSource[],
): string[] {
  return references.filter((reference) => !reference.assetId
    || !sources.some((source) => source.assetId === reference.assetId))
    .map((reference) => reference.fileId);
}

function sameContext(left: ImportContext, right: ImportContext) {
  return left.userId === right.userId && left.workspaceId === right.workspaceId
    && left.clientProfileId === right.clientProfileId;
}

async function checkpointEntry(
  ports: ReferenceImportPorts, receipt: GuestImportReceipt, entry: ReferenceReceipt,
): Promise<GuestImportReceipt> {
  const references = receipt.references.some((item) => item.fileId === entry.fileId)
    ? receipt.references.map((item) => (item.fileId === entry.fileId ? entry : item))
    : [...receipt.references, entry];
  const next = { ...receipt, references };
  await ports.saveReceipt(next);
  return next;
}

function blankEntry(fileId: string): ReferenceReceipt {
  return { fileId, assetId: null, sourceId: null, state: 'pending' };
}

/**
 * Marker for deterministically rejected uploads (local validation said no
 * before any byte was sent). Unlike a lost response, retrying cannot help,
 * so the core blocks with guidance instead of parking the file as uncertain.
 */
export const UPLOAD_REJECTED = 'guest_upload_rejected';

function isReadableFile(file: unknown): file is File {
  return !!file && (typeof file === 'object' || typeof file === 'function');
}

/**
 * Serial per-file transfer with checkpoints. Never reports success by mere
 * absence of exceptions: every file is confirmed by reading the aggregate,
 * and `verified` requires all expected assetIds to resolve on a final read.
 */
export async function ensureGuestReferences(
  input: ReferenceImportInput, ports: ReferenceImportPorts,
): Promise<ImportOutcome> {
  const { draft, context, workId } = input;
  try {
    const receipt = await ports.loadReceipt(draft.id);
    if (!receipt || !sameContext(receipt, context))
      return { kind: 'blocked', code: 'receipt_context_mismatch' };
    if (draft.files.length === 0) {
      // Unreachable by construction (partial implies files); fail closed and
      // never emit an unverified `verified`.
      return { kind: 'blocked', code: 'transfer_not_confirmed' };
    }
    if (!input.attachmentsEnabled)
      return { kind: 'blocked', code: 'attachments_disabled' };

    let current = receipt;
    if (current.phase !== 'transferring') {
      current = { ...current, phase: 'transferring' };
      await ports.saveReceipt(current);
    }
    let lastSources: GuestSource[] = [];
    const pendingNow = () => pendingReferenceIds(current.references, lastSources);

    for (let index = 0; index < draft.files.length; index += 1) {
      const fileId = `${draft.id}:${index}`;
      const file = draft.files[index];
      // 1. Revalidate File/size/type; the snapshot is trusted but never blindly.
      if (!isReadableFile(file)) return { kind: 'blocked', code: 'invalid_reference' };
      const { errors } = selectFiles([], [file]);
      if (errors.length > 0) return { kind: 'blocked', code: 'invalid_reference' };

      const entry = current.references.find((item) => item.fileId === fileId)
        ?? blankEntry(fileId);

      // Uncertain uploads wait for an explicit retry; other files still proceed.
      if (entry.state === 'uncertain' && !input.retryUncertainUpload) continue;

      // 2. Read the work and its sources; an already-associated assetId skips
      // network for this file (analysis state never triggers a duplicate).
      let aggregate = await ports.readWork(workId);
      lastSources = aggregate.sources;
      const known = entry.assetId
        ? aggregate.sources.find((source) => source.assetId === entry.assetId)
        : undefined;
      if (known) {
        current = await checkpointEntry(ports, current, { ...entry, sourceId: known.id, state: 'attached' });
        continue;
      }

      let assetId = entry.assetId;
      // 3. Upload only when no assetId is checkpointed (first attempt is
      // explicit by construction; uncertain re-uploads need the retry flag).
      if (!assetId || entry.state === 'uncertain') {
        current = await checkpointEntry(ports, current, { ...entry, state: 'uploading' });
        let uploaded: { assetId: string } | null = null;
        try {
          uploaded = await ports.upload(file);
        } catch (error) {
          if (error instanceof Error && error.message === UPLOAD_REJECTED) {
            // Deterministic rejection: restore the pre-upload entry and block
            // with guidance. Parking this as uncertain would offer a retry
            // that can never succeed.
            current = await checkpointEntry(ports, current, entry);
            return { kind: 'blocked', code: 'invalid_reference' };
          }
          uploaded = null;
        }
        if (!uploaded || typeof uploaded.assetId !== 'string' || !uploaded.assetId) {
          // 4. Lost upload response: uncertain, stop, offer explicit retry.
          // Earlier files keep their checkpoints; nothing is re-sent.
          current = await checkpointEntry(ports, current, { ...entry, state: 'uncertain' });
          current = { ...current, phase: 'partial' };
          await ports.saveReceipt(current);
          return { kind: 'partial', workId, pendingFileIds: pendingNow() };
        }
        assetId = uploaded.assetId;
        current = await checkpointEntry(
          ports, current, { ...entry, assetId, sourceId: null, state: 'uploaded' },
        );
        // 5. Fresh revision after the upload round-trip.
        aggregate = await ports.readWork(workId);
        lastSources = aggregate.sources;
      }

      current = await checkpointEntry(
        ports, current, { ...entry, assetId, sourceId: null, state: 'attaching' },
      );
      try {
        await ports.attachSource({
          workItemId: workId, expectedUpdatedAt: aggregate.work.updatedAt,
          action: 'attachSource', assetId, usage: 'both',
        });
      } catch {
        // 6. Even after timeout/409 the aggregate decides, not the exception.
      }
      const verified = await ports.readWork(workId);
      lastSources = verified.sources;
      const attached = verified.sources.find((source) => source.assetId === assetId);
      if (!attached) {
        current = await checkpointEntry(
          ports, current, { ...entry, assetId, sourceId: null, state: 'uploaded' },
        );
        current = { ...current, phase: 'partial' };
        await ports.saveReceipt(current);
        return { kind: 'partial', workId, pendingFileIds: pendingNow() };
      }
      // 7. Only now advance to the next file.
      current = await checkpointEntry(
        ports, current, { ...entry, assetId, sourceId: attached.id, state: 'attached' },
      );
    }

    // 8. Final full canonical read before emitting `verified`.
    const final = await ports.readWork(workId);
    lastSources = final.sources;
    const pending = pendingNow();
    if (pending.length > 0) {
      current = { ...current, phase: 'partial' };
      await ports.saveReceipt(current);
      return { kind: 'partial', workId, pendingFileIds: pending };
    }
    const latest = await ports.loadReceipt(draft.id);
    if (!latest || !sameContext(latest, context))
      return { kind: 'blocked', code: 'receipt_context_mismatch' };
    await ports.saveReceipt({ ...latest, workId, phase: 'verified', references: current.references });
    return { kind: 'verified', workId };
  } catch {
    return { kind: 'blocked', code: 'transfer_not_confirmed' };
  }
}
