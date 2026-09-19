import { describe, expect, it } from 'vitest';
import type {
  GuestImportReceipt, ImportContext, ReferenceImportPorts, SourceSnapshot,
} from './import-contracts';
import { ReferenceUploadUnknown } from './import-contracts';
import type { GuestDraft } from '@/components/guest-home/guest-core.mjs';
import { transferGuestReferences } from './import-references';

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';
const WORK_ID = 'work-1';
const CONTEXT: ImportContext = { userId: 'user-1', workspaceId: 'ws-1', clientProfileId: 'brand-1' };

function makeDraft(fileCount: number): GuestDraft {
  return {
    version: 1, id: DRAFT_ID, request: 'Anúncio', intent: 'single', exampleId: null,
    files: Array.from({ length: fileCount }, (_, i) =>
      new File([new Uint8Array([i + 1])], `ref-${i}.png`, { type: 'image/png' })),
    createdAt: 1789680000000, expiresAt: 1789680000000 + 86400000,
  };
}

function makeReceipt(): GuestImportReceipt {
  return {
    ...CONTEXT, guestDraftId: DRAFT_ID, workId: WORK_ID, phase: 'verified',
    references: [], expiresAt: 1789680000000 + 86400000, revision: 1,
    leaseOwner: 'owner-1', leaseExpiresAt: 1789680000000 + 120000,
  };
}

/** State-storing fake: canonical source list + receipt with CAS. */
function makePorts() {
  let receipt: GuestImportReceipt = makeReceipt();
  let sources: SourceSnapshot = { sources: [], updatedAt: '2026-09-18T00:00:00.000Z' };
  let revision = 1;
  const calls = { upload: 0, attach: 0, read: 0, save: 0 };
  let uploadPlan: ('ok' | 'fail' | 'unknown')[] = [];
  let attachPlan: ('ok' | 'conflict')[] = [];
  let assets = 0;
  let sourceSeq = 0;
  const ports: ReferenceImportPorts = {
    loadReceipt: async () => structuredClone(receipt),
    saveReceipt: async (next) => {
      calls.save += 1;
      if (next.revision !== revision) throw new Error('Recibo desatualizado.');
      revision += 1;
      receipt = structuredClone({ ...next, revision });
    },
    uploadFile: async () => {
      calls.upload += 1;
      const step = uploadPlan.shift() ?? 'ok';
      if (step === 'fail') throw new Error('rejected');
      if (step === 'unknown') throw new ReferenceUploadUnknown();
      assets += 1;
      return { assetId: `asset-${assets}` };
    },
    attachSource: async ({ assetId, expectedUpdatedAt }) => {
      calls.attach += 1;
      if (sources.updatedAt !== expectedUpdatedAt) {
        throw Object.assign(new Error('stale'), { status: 409 });
      }
      const step = attachPlan.shift() ?? 'ok';
      if (step === 'conflict') {
        sources = { ...sources, updatedAt: `2026-09-18T00:00:0${calls.attach}.000Z` };
        throw Object.assign(new Error('stale'), { status: 409 });
      }
      sourceSeq += 1;
      const source = { id: `source-${sourceSeq}`, assetId };
      sources = {
        sources: [...sources.sources, source],
        updatedAt: `2026-09-18T00:00:1${sourceSeq}.000Z`,
      };
      return { sourceId: source.id };
    },
    readSources: async () => {
      calls.read += 1;
      return structuredClone(sources);
    },
  };
  return {
    ports, calls,
    planUpload: (plan: ('ok' | 'fail' | 'unknown')[]) => { uploadPlan = [...plan]; },
    planAttach: (plan: ('ok' | 'conflict')[]) => { attachPlan = [...plan]; },
    get receipt() { return receipt; },
    setReceipt: (mutate: (current: GuestImportReceipt) => GuestImportReceipt) => {
      receipt = structuredClone({ ...mutate(receipt), revision });
    },
  };
}

const INPUT = { draft: makeDraft(3), workId: WORK_ID, context: CONTEXT };

describe('transferGuestReferences', () => {
  it('transfere em série com checkpoints e declara verificação após releitura', async () => {
    const fake = makePorts();
    const outcome = await transferGuestReferences(INPUT, fake.ports);
    expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
    expect(fake.calls.upload).toBe(3);
    expect(fake.calls.attach).toBe(3);
    expect(fake.receipt.references.map((ref) => ref.state)).toEqual(['attached', 'attached', 'attached']);
    expect(fake.calls.save).toBeGreaterThanOrEqual(3);
  });

  it('falha no meio retoma só os pendentes, sem repetir associados', async () => {
    const fake = makePorts();
    fake.planUpload(['ok', 'fail', 'ok']);
    const first = await transferGuestReferences(INPUT, fake.ports);
    expect(first.kind).toBe('partial');
    expect(fake.receipt.references.map((ref) => ref.state)).toEqual(['attached', 'pending', 'pending']);

    fake.planUpload(['ok']);
    const second = await transferGuestReferences(INPUT, fake.ports);
    expect(second).toEqual({ kind: 'verified', workId: WORK_ID });
    // Failed attempt + 3 successful uploads; file 0 never re-uploaded.
    expect(fake.calls.upload).toBe(4);
    expect(fake.calls.attach).toBe(3);
  });

  it('resposta perdida após associação adota sem duplicar', async () => {
    const fake = makePorts();
    await transferGuestReferences({ ...INPUT, draft: makeDraft(1) }, fake.ports);
    expect(fake.calls.attach).toBe(1);
    // Simulate the lost response: canonical has the source, receipt lags behind.
    fake.setReceipt((current) => ({
      ...current,
      references: [{ ...current.references[0], state: 'attaching', sourceId: null }],
    }));
    const outcome = await transferGuestReferences({ ...INPUT, draft: makeDraft(1) }, fake.ports);
    expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
    expect(fake.calls.attach).toBe(1);
  });

  it('envio incerto não é declarado falha', async () => {
    const fake = makePorts();
    fake.planUpload(['unknown', 'ok', 'ok']);
    const outcome = await transferGuestReferences(INPUT, fake.ports);
    expect(outcome.kind).toBe('partial');
    if (outcome.kind !== 'partial') throw new Error('expected partial');
    expect(outcome.pendingFileIds).toEqual([`${DRAFT_ID}:0`, `${DRAFT_ID}:1`, `${DRAFT_ID}:2`]);
    expect(fake.receipt.references[0].state).toBe('uncertain');
  });

  it('409 relê o agregado e retoma sem duplicar', async () => {
    const fake = makePorts();
    fake.planAttach(['conflict', 'ok', 'ok', 'ok']);
    const outcome = await transferGuestReferences(INPUT, fake.ports);
    expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
    expect(fake.calls.read).toBeGreaterThanOrEqual(2);
  });

  it('recibo divergente bloqueia sem tocar na rede de arquivos', async () => {
    const fake = makePorts();
    const other = { ...CONTEXT, clientProfileId: 'brand-2' };
    const outcome = await transferGuestReferences({ ...INPUT, context: other }, fake.ports);
    expect(outcome).toEqual({ kind: 'blocked', code: 'context_mismatch' });
    expect(fake.calls.upload).toBe(0);
    expect(fake.calls.attach).toBe(0);
  });
});
