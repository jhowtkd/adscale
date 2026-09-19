"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useCreateCreativeWorkDraft, useCreativeWorkSourceActions } from '@/lib/hooks/use-creative-work';
import { uploadChatAttachment } from '@/lib/assistant/chat-attachments';
import { isAllowedImageType, validateImageMagicBytes } from '@/lib/upload-config';
import type { GuestDraft } from '@/components/guest-home/guest-core.mjs';
import { newDraftId } from '@/components/guest-home/guest-core.mjs';
import {
  claimImportLease,
  loadDraft,
  loadImportReceipt,
  releaseImportLease,
  removeDraft,
  renewImportLease,
  saveImportReceipt,
} from '@/components/guest-home/guest-store.mjs';
import type {
  CanonicalDraft,
  CreateTextDraftInput,
  GuestImportReceipt,
  GuestSource,
  ImportContext,
  ImportOutcome,
  ReferenceImportPorts,
  ReferenceWork,
  TextImportPorts,
} from './import-contracts';
import { ensureCanonicalGuestDraft } from './import-text';
import { UPLOAD_REJECTED, ensureGuestReferences } from './import-references';

/** Lease heartbeat: the store holds a 120s lease, renewed every 30s. */
const RENEW_EVERY_MS = 30_000;

/**
 * Tool kinds the database accepts (creative_work_items_tool_kind_check).
 * Guest intents are a subset; anything else from the network is rejected
 * before a CanonicalDraft is built — never a blind cast of the JSON.
 */
const CANONICAL_INTENTS = new Set([
  'social_post', 'variations', 'single', 'format_adaptation', 'restyle',
]);

function sameContext(left: ImportContext, right: ImportContext): boolean {
  return left.userId === right.userId && left.workspaceId === right.workspaceId
    && left.clientProfileId === right.clientProfileId;
}

/** Validates one canonical work payload before projecting `createdByUserId`. */
export function toCanonicalDraft(value: unknown): CanonicalDraft {
  if (!value || typeof value !== 'object') throw new Error('invalid_canonical_work');
  const row = value as Record<string, unknown>;
  const text = (field: string): string => {
    const current = row[field];
    if (typeof current !== 'string' || !current) throw new Error('invalid_canonical_work');
    return current;
  };
  const intent = text('toolKind');
  if (!CANONICAL_INTENTS.has(intent)) throw new Error('invalid_canonical_work');
  const draftKey = row.draftKey;
  if (draftKey !== null && typeof draftKey !== 'string') throw new Error('invalid_canonical_work');
  return {
    userId: text('createdByUserId'),
    workspaceId: text('workspaceId'),
    clientProfileId: text('clientProfileId'),
    id: text('id'),
    draftKey,
    request: text('request'),
    intent: intent as CanonicalDraft['intent'],
  };
}

const SOURCE_STATUSES = new Set(['uploaded', 'analyzing', 'ready', 'failed']);

/** Validates the work+sources aggregate before the references core sees it. */
export function toReferenceWork(value: unknown): ReferenceWork {
  if (!value || typeof value !== 'object') throw new Error('invalid_reference_work');
  const data = value as { work?: unknown; sources?: unknown };
  const work = toCanonicalDraft(data.work);
  const raw = (data.work ?? {}) as Record<string, unknown>;
  const updatedAt = raw.updatedAt;
  if (typeof updatedAt !== 'string' || !updatedAt) throw new Error('invalid_reference_work');
  if (!Array.isArray(data.sources)) throw new Error('invalid_reference_work');
  const sources: GuestSource[] = data.sources.map((entry): GuestSource => {
    if (!entry || typeof entry !== 'object') throw new Error('invalid_reference_work');
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id) throw new Error('invalid_reference_work');
    if (row.assetId !== null && (typeof row.assetId !== 'string' || !row.assetId)) {
      throw new Error('invalid_reference_work');
    }
    if (typeof row.status !== 'string' || !SOURCE_STATUSES.has(row.status)) {
      throw new Error('invalid_reference_work');
    }
    return {
      id: row.id,
      assetId: row.assetId as string | null,
      status: row.status as GuestSource['status'],
    };
  });
  return { work: { ...work, updatedAt }, sources };
}

export type GuestImportAttempt =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; outcome: ImportOutcome; cleanupError: boolean };

export type GuestImportStartOptions = { retryUncertainUpload?: boolean };

export function useGuestDraftImport(options: {
  draft: GuestDraft | null;
  context: ImportContext | null;
  attachmentsEnabled: boolean;
}) {
  const { draft, context, attachmentsEnabled } = options;
  const { mutateAsync } = useCreateCreativeWorkDraft();
  const { mutateAsync: mutateSourceAsync } = useCreativeWorkSourceActions();
  const [attempt, setAttempt] = useState<GuestImportAttempt>({ status: 'idle' });
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const reset = useCallback(() => {
    if (busyRef.current) return;
    setAttempt({ status: 'idle' });
  }, []);

  const start = useCallback(async (startOptions?: GuestImportStartOptions): Promise<ImportOutcome | null> => {
    if (busyRef.current) return null;
    if (!draft || !context) return null;
    const retryUncertainUpload = startOptions?.retryUncertainUpload === true;
    busyRef.current = true;
    if (mountedRef.current) setAttempt({ status: 'busy' });
    // A new lease owner per explicit attempt; retries reuse the same draft UUID.
    const owner = newDraftId();
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const stopHeartbeat = () => {
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    };
    try {
      // Revalidate the snapshot/TTL before invoking the core; never trust a cast.
      const fresh = await loadDraft(draft.id);
      if (!fresh || fresh.id !== draft.id || fresh.request !== draft.request
        || fresh.intent !== draft.intent || fresh.files.length !== draft.files.length) {
        const outcome: ImportOutcome = { kind: 'blocked', code: 'snapshot_changed' };
        if (mountedRef.current) setAttempt({ status: 'done', outcome, cleanupError: false });
        return outcome;
      }
      const claim = await claimImportLease(draft.id, context, owner, Date.now());
      if (claim.kind !== 'acquired') {
        const code = claim.kind === 'busy' ? 'lease_busy'
          : claim.kind === 'context_mismatch' ? 'receipt_context_mismatch'
          : 'storage_unavailable';
        const outcome: ImportOutcome = { kind: 'blocked', code };
        if (mountedRef.current) setAttempt({ status: 'done', outcome, cleanupError: false });
        return outcome;
      }
      heartbeat = setInterval(() => {
        // Renewal keeps the lease alive; per-mutation lease checks below are
        // the actual enforcement, so a failed heartbeat never silently extends.
        void renewImportLease(draft.id, owner, Date.now()).catch(() => undefined);
      }, RENEW_EVERY_MS);
      const loadReceiptPort = (id: string) => loadImportReceipt(id);
      const saveReceiptPort = async (receipt: GuestImportReceipt) => {
        // CAS local: reload the current revision, compare context + lease
        // owner, then write the increment. The store transaction rejects a
        // revision that moved underneath this load.
        const current = await loadImportReceipt(receipt.guestDraftId);
        if (!current || !sameContext(current, context) || current.leaseOwner !== owner) {
          throw new Error('import_receipt_conflict');
        }
        // Preserve the live lease: the core spreads the copy it loaded,
        // which predates heartbeats.
        await saveImportReceipt({
          ...receipt,
          revision: current.revision,
          leaseOwner: current.leaseOwner,
          leaseExpiresAt: current.leaseExpiresAt,
        }, current.revision);
      };
      const readAggregate = async (id: string) => {
        const res = await apiFetch(`/api/creative-work/${id}`);
        if (!res.ok) throw new Error(`read_work_failed:${res.status}`);
        return toReferenceWork(await res.json());
      };
      const ports: TextImportPorts = {
        loadReceipt: loadReceiptPort,
        saveReceipt: saveReceiptPort,
        createDraft: async (input: CreateTextDraftInput) => {
          const created = await mutateAsync({
            clientProfileId: input.clientProfileId,
            draftKey: input.draftKey,
            request: input.request,
            intent: input.intent,
            format: input.format,
            settings: input.settings,
          });
          return toCanonicalDraft(created.work);
        },
        readWork: async (id: string) => {
          const aggregate = await readAggregate(id);
          const { updatedAt: _updatedAt, ...canonical } = aggregate.work;
          void _updatedAt;
          return canonical;
        },
      };
      const textOutcome = await ensureCanonicalGuestDraft({ draft: fresh, context }, ports);
      let outcome: ImportOutcome = textOutcome;
      // One explicit click transfers text and first-time references under the
      // same lease. Uncertain re-uploads always need a second explicit click.
      if (textOutcome.kind === 'partial' && attachmentsEnabled) {
        const referencePorts: ReferenceImportPorts = {
          loadReceipt: loadReceiptPort,
          saveReceipt: saveReceiptPort,
          upload: async (file: File) => {
            // Deterministic local rejection before any byte is sent: retrying
            // cannot help, so mark it rejected instead of uncertain.
            if (!isAllowedImageType(file.type)
              || !(await validateImageMagicBytes(file, file.type))) {
              throw new Error(UPLOAD_REJECTED);
            }
            const attachment = await uploadChatAttachment(file);
            if (!attachment || typeof attachment.assetId !== 'string' || !attachment.assetId) {
              throw new Error('invalid_upload_response');
            }
            return { assetId: attachment.assetId };
          },
          readWork: readAggregate,
          attachSource: async (input) => mutateSourceAsync({
            workItemId: input.workItemId,
            action: 'attachSource',
            assetId: input.assetId,
            usage: 'both',
            expectedUpdatedAt: input.expectedUpdatedAt,
          }),
        };
        outcome = await ensureGuestReferences({
          draft: fresh, context, workId: textOutcome.workId,
          attachmentsEnabled, retryUncertainUpload,
        }, referencePorts);
      }
      let cleanupError = false;
      if (outcome.kind === 'verified') {
        // Clear the content snapshot after the verified receipt; the minimal
        // receipt stays until the original expiry. A failed cleanup never
        // authorizes recreating the work.
        try {
          await removeDraft(draft.id);
        } catch {
          cleanupError = true;
        }
      }
      if (mountedRef.current) setAttempt({ status: 'done', outcome, cleanupError });
      return outcome;
    } catch {
      const outcome: ImportOutcome = { kind: 'blocked', code: 'transfer_not_confirmed' };
      if (mountedRef.current) setAttempt({ status: 'done', outcome, cleanupError: false });
      return outcome;
    } finally {
      stopHeartbeat();
      try {
        await releaseImportLease(draft.id, owner);
      } catch {
        /* The lease expires on its own; release is best-effort. */
      }
      busyRef.current = false;
    }
  }, [draft, context, attachmentsEnabled, mutateAsync, mutateSourceAsync]);

  return { attempt, busy: attempt.status === 'busy', start, reset };
}
