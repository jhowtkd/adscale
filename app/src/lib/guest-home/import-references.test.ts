import { expect, it } from 'vitest';
import { createDraft } from '@/components/guest-home/guest-core.mjs';
import type { GuestDraft } from '@/components/guest-home/guest-core.mjs';
import type {
  ImportContext, ReferenceImportInput, ReferenceReceipt,
} from './import-contracts';
import { memoryReferenceImport } from '../../../tests/helpers/guest-import';
import { UPLOAD_REJECTED, ensureGuestReferences, pendingReferenceIds } from './import-references';

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';
const WORK_ID = 'bb222222-2222-4222-8222-222222222222';

function makeContext(overrides: Partial<ImportContext> = {}): ImportContext {
  return { userId: 'user-a', workspaceId: 'workspace-a', clientProfileId: 'brand-a', ...overrides };
}

function makeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

function makeDraft(fileNames: string[] = ['a.png', 'b.png']): GuestDraft {
  return createDraft(
    { request: 'Peça com referências', intent: 'single', files: fileNames.map(makeFile) },
    DRAFT_ID,
  );
}

function makeInput(draft: GuestDraft, context: ImportContext, overrides: Partial<ReferenceImportInput> = {}): ReferenceImportInput {
  return { draft, context, workId: WORK_ID, attachmentsEnabled: true, retryUncertainUpload: false, ...overrides };
}

it('retoma só a referência ainda não associada', () => {
  const references: ReferenceReceipt[] = [
    { fileId: 'draft:0', assetId: 'asset-a', sourceId: 'source-a', state: 'attached' },
    { fileId: 'draft:1', assetId: 'asset-b', sourceId: null, state: 'attaching' },
  ];
  expect(pendingReferenceIds(references, [
    { id: 'source-a', assetId: 'asset-a', status: 'analyzing' },
  ])).toEqual(['draft:1']);
});

it('transfere todos os arquivos em série e verifica no final', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  const outcome = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(backend.uploads.map((file) => file.name)).toEqual(['a.png', 'b.png']);
  expect(backend.attaches).toHaveLength(2);
  expect(backend.attaches[0]).toEqual({ assetId: 'asset-1', expectedUpdatedAt: expect.any(String), usage: 'both' });
  expect(backend.attaches[1]).toEqual({ assetId: 'asset-2', expectedUpdatedAt: expect.any(String), usage: 'both' });
  // The second attach carries a newer revision than the first: the aggregate
  // is re-read along the way, never trusted from a stale cache.
  expect(backend.attaches[1].expectedUpdatedAt).not.toBe(backend.attaches[0].expectedUpdatedAt);
  expect(backend.sources).toHaveLength(2);
  expect(backend.receipt.phase).toBe('verified');
  expect(backend.receipt.references).toEqual([
    { fileId: `${DRAFT_ID}:0`, assetId: 'asset-1', sourceId: 'source-1', state: 'attached' },
    { fileId: `${DRAFT_ID}:1`, assetId: 'asset-2', sourceId: 'source-2', state: 'attached' },
  ]);
});

it('falha no segundo arquivo retoma só o pendente, sem repetir o primeiro', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  const input = makeInput(draft, context);
  // Fail the SECOND upload, not the first.
  let calls = 0;
  const flakyPorts = {
    ...backend.ports,
    upload: async (file: File) => {
      calls += 1;
      if (calls === 2) throw new Error('network');
      return backend.ports.upload(file);
    },
  };
  const first = await ensureGuestReferences(input, flakyPorts);
  expect(first).toEqual({ kind: 'partial', workId: WORK_ID, pendingFileIds: [`${DRAFT_ID}:1`] });
  expect(backend.sources).toHaveLength(1);
  expect(backend.receipt.phase).toBe('partial');

  // Plain retry does not touch the uncertain file nor the attached one.
  const second = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(second).toEqual({ kind: 'partial', workId: WORK_ID, pendingFileIds: [`${DRAFT_ID}:1`] });
  expect(backend.uploads).toHaveLength(1);
  expect(backend.sources).toHaveLength(1);

  // Explicit uncertain retry resumes only the pending file.
  const third = await ensureGuestReferences(
    makeInput(draft, context, { retryUncertainUpload: true }), backend.ports,
  );
  expect(third).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(backend.uploads.map((file) => file.name)).toEqual(['a.png', 'b.png']);
  expect(backend.sources).toHaveLength(2);
});

it('pula rede do arquivo já associado, inclusive em análise', async () => {
  const draft = makeDraft(['a.png']);
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  backend.sources.push({ id: 'source-9', assetId: 'asset-9', status: 'analyzing' });
  backend.receipt.references = [
    { fileId: `${DRAFT_ID}:0`, assetId: 'asset-9', sourceId: null, state: 'uploaded' },
  ];
  const outcome = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(backend.uploads).toHaveLength(0);
  expect(backend.attaches).toHaveLength(0);
  expect(backend.sources).toHaveLength(1);
  expect(backend.receipt.references[0]).toEqual({
    fileId: `${DRAFT_ID}:0`, assetId: 'asset-9', sourceId: 'source-9', state: 'attached',
  });
});

it('associação salva com resposta perdida é reconhecida por leitura', async () => {
  const draft = makeDraft(['a.png']);
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  backend.loseAttachResponseOnce();
  const outcome = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(outcome).toEqual({ kind: 'verified', workId: WORK_ID });
  expect(backend.attaches).toHaveLength(1);
  expect(backend.sources).toHaveLength(1);
  expect(backend.receipt.references[0].state).toBe('attached');
});

it('associação rejeitada mantém pendente e repete só a associação', async () => {
  const draft = makeDraft(['a.png']);
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  backend.failAttachNext(new Error('limit'));
  const first = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(first).toEqual({ kind: 'partial', workId: WORK_ID, pendingFileIds: [`${DRAFT_ID}:0`] });
  expect(backend.uploads).toHaveLength(1);
  expect(backend.sources).toHaveLength(0);
  expect(backend.receipt.references[0]).toMatchObject({ assetId: 'asset-1', state: 'uploaded' });

  const second = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(second).toEqual({ kind: 'verified', workId: WORK_ID });
  // Same assetId re-attached; no second upload.
  expect(backend.uploads).toHaveLength(1);
  expect(backend.attaches.map((attach) => attach.assetId)).toEqual(['asset-1', 'asset-1']);
  expect(backend.sources).toHaveLength(1);
});

it('resposta perdida de upload marca incerto e para sem afirmar', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  backend.loseUploadResponseOnce();
  const outcome = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(outcome).toEqual({
    kind: 'partial', workId: WORK_ID, pendingFileIds: [`${DRAFT_ID}:0`, `${DRAFT_ID}:1`],
  });
  expect(backend.receipt.references[0]).toMatchObject({ assetId: null, state: 'uncertain' });
  expect(backend.attaches).toHaveLength(0);
});

it('upload determinístico rejeitado bloqueia sem marcar incerto', async () => {
  const draft = makeDraft(['a.png']);
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  const ports = {
    ...backend.ports,
    upload: async () => { throw new Error(UPLOAD_REJECTED); },
  };
  const outcome = await ensureGuestReferences(makeInput(draft, context), ports);
  expect(outcome).toEqual({ kind: 'blocked', code: 'invalid_reference' });
  expect(backend.receipt.references[0]).toMatchObject({ assetId: null, state: 'pending' });
  expect(backend.attaches).toHaveLength(0);
});

it('bloqueia quando o recibo não pode ser confirmado', async () => {
  const draft = makeDraft(['a.png']);
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  backend.failSaveNext(new Error('import_receipt_conflict'));
  const outcome = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
  expect(backend.uploads).toHaveLength(0);
});

it('bloqueia recibo de outro contexto sem tocar na rede', async () => {
  const draft = makeDraft(['a.png']);
  const backend = memoryReferenceImport(draft, makeContext(), WORK_ID);
  const outcome = await ensureGuestReferences(
    makeInput(draft, makeContext({ clientProfileId: 'brand-other' })), backend.ports,
  );
  expect(outcome).toEqual({ kind: 'blocked', code: 'receipt_context_mismatch' });
  expect(backend.uploads).toHaveLength(0);
  expect(backend.reads).toBe(0);
});

it('bloqueia quando anexos estão desligados, sem descartar arquivos', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  const outcome = await ensureGuestReferences(
    makeInput(draft, context, { attachmentsEnabled: false }), backend.ports,
  );
  expect(outcome).toEqual({ kind: 'blocked', code: 'attachments_disabled' });
  expect(backend.uploads).toHaveLength(0);
  expect(backend.receipt.phase).toBe('created');
});

it('rejeita arquivo inválido sem iniciar transferência', async () => {
  const context = makeContext();
  const bad = new File([new Uint8Array([1])], 'huge.bmp', { type: 'image/bmp' });
  const draft = { ...makeDraft(['a.png']), files: [bad] };
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  const outcome = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(outcome).toEqual({ kind: 'blocked', code: 'invalid_reference' });
  expect(backend.uploads).toHaveLength(0);
});

it('leitura final que perde fonte emite parcial, nunca verificado', async () => {
  const draft = makeDraft(['a.png']);
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  // Reads for one file: initial, post-upload, post-attach, final. Conceal the
  // source only on the final read.
  backend.concealAfterReads(3, ['asset-1']);
  const outcome = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(outcome).toEqual({ kind: 'partial', workId: WORK_ID, pendingFileIds: [`${DRAFT_ID}:0`] });
  expect(backend.receipt.phase).toBe('partial');
});

it('falha fechada sem arquivos: nunca verifica sem verificar', async () => {
  const draft = makeDraft([]);
  const context = makeContext();
  const backend = memoryReferenceImport(draft, context, WORK_ID);
  const outcome = await ensureGuestReferences(makeInput(draft, context), backend.ports);
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
});
