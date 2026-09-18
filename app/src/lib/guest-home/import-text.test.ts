import { expect, it } from 'vitest';
import { createDraft } from '@/components/guest-home/guest-core.mjs';
import type { GuestDraft } from '@/components/guest-home/guest-core.mjs';
import type { CreateTextDraftInput, ImportContext } from './import-contracts';
import { memoryTextImport } from '../../../tests/helpers/guest-import';
import { ensureCanonicalGuestDraft } from './import-text';

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';

function makeDraft(overrides: Partial<{ request: string; intent: 'single' | 'variations' | 'format_adaptation'; files: File[] }> = {}): GuestDraft {
  return createDraft({
    request: 'Uma peça de lançamento',
    intent: 'single',
    files: [],
    ...overrides,
  }, DRAFT_ID);
}

function makeContext(overrides: Partial<ImportContext> = {}): ImportContext {
  return { userId: 'user-a', workspaceId: 'workspace-a', clientProfileId: 'brand-a', ...overrides };
}

function makeFile(name = 'ref.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

it('recupera resposta perdida sem criar outro Trabalho', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryTextImport(draft, context);
  backend.loseResponseOnce();
  const first = await ensureCanonicalGuestDraft({ draft, context }, backend.ports);
  expect(first.kind).toBe('blocked');
  const second = await ensureCanonicalGuestDraft({ draft, context }, backend.ports);
  expect(second.kind).toBe('verified');
  expect(backend.works.size).toBe(1);
  expect([...backend.works.values()][0].request).toBe(draft.request);
});

it('retry sem edição reutiliza o mesmo Trabalho', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryTextImport(draft, context);
  const first = await ensureCanonicalGuestDraft({ draft, context }, backend.ports);
  const second = await ensureCanonicalGuestDraft({ draft, context }, backend.ports);
  expect(first).toEqual({ kind: 'verified', workId: 'bb222222-2222-4222-8222-222222222222' });
  expect(second).toEqual(first);
  expect(backend.works.size).toBe(1);
});

it('bloqueia marca divergente sem tocar no Trabalho alheio', async () => {
  const draft = makeDraft();
  const backend = memoryTextImport(draft, makeContext());
  const outcome = await ensureCanonicalGuestDraft(
    { draft, context: makeContext({ clientProfileId: 'brand-other' }) },
    backend.ports,
  );
  expect(outcome).toEqual({ kind: 'blocked', code: 'receipt_context_mismatch' });
  expect(backend.works.size).toBe(0);
});

it('detecta Trabalho existente editado no Estúdio', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryTextImport(draft, context);
  const first = await ensureCanonicalGuestDraft({ draft, context }, backend.ports);
  expect(first.kind).toBe('verified');
  // Simula edição posterior no Estúdio: mesmo vínculo, conteúdo divergente.
  const key = `${context.workspaceId}:${context.userId}:${draft.id}`;
  const stored = backend.works.get(key);
  expect(stored).toBeDefined();
  backend.works.set(key, { ...stored!, request: 'Texto reescrito no Estúdio' });
  const second = await ensureCanonicalGuestDraft({ draft, context }, backend.ports);
  expect(second.kind).toBe('existing_changed');
  expect(backend.works.size).toBe(1);
});

it('bloqueia quando o Trabalho canônico pertence a outro contexto', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryTextImport(draft, context);
  backend.works.set(`${context.workspaceId}:${context.userId}:${draft.id}`, {
    ...context, clientProfileId: 'brand-other',
    id: 'cc333333-3333-4333-8333-333333333333',
    draftKey: draft.id, request: draft.request, intent: draft.intent,
  });
  const outcome = await ensureCanonicalGuestDraft({ draft, context }, backend.ports);
  expect(outcome).toEqual({ kind: 'blocked', code: 'work_context_mismatch' });
});

it('bloqueia quando o recibo não pode ser confirmado', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryTextImport(draft, context);
  const ports = {
    ...backend.ports,
    saveReceipt: async () => { throw new Error('storage-full'); },
  };
  const outcome = await ensureCanonicalGuestDraft({ draft, context }, ports);
  expect(outcome).toEqual({ kind: 'blocked', code: 'transfer_not_confirmed' });
});

it('bloqueia sem recibo vinculado', async () => {
  const draft = makeDraft();
  const context = makeContext();
  const backend = memoryTextImport(draft, context);
  const outcome = await ensureCanonicalGuestDraft(
    { draft, context },
    { ...backend.ports, loadReceipt: async () => null },
  );
  expect(outcome).toEqual({ kind: 'blocked', code: 'receipt_context_mismatch' });
  expect(backend.works.size).toBe(0);
});

it('retorna parcial com referências pendentes quando há arquivos', async () => {
  const draft = makeDraft({ files: [makeFile('a.png'), makeFile('b.png')] });
  const context = makeContext();
  const backend = memoryTextImport(draft, context);
  const outcome = await ensureCanonicalGuestDraft({ draft, context }, backend.ports);
  expect(outcome).toEqual({
    kind: 'partial',
    workId: 'bb222222-2222-4222-8222-222222222222',
    pendingFileIds: [`${DRAFT_ID}:0`, `${DRAFT_ID}:1`],
  });
});

it('cria o rascunho canônico sem bytes de arquivo e com formatos por intento', async () => {
  for (const [intent, targetFormats] of [
    ['single', []],
    ['format_adaptation', ['1:1', '9:16']],
  ] as const) {
    const draft = makeDraft({ intent, files: [makeFile()] });
    const context = makeContext();
    const backend = memoryTextImport(draft, context);
    let seen: CreateTextDraftInput | null = null;
    const ports = {
      ...backend.ports,
      createDraft: async (input: CreateTextDraftInput) => {
        seen = input;
        return backend.ports.createDraft(input);
      },
    };
    const outcome = await ensureCanonicalGuestDraft({ draft, context }, ports);
    expect(outcome.kind).toBe('partial');
    expect(seen).toEqual({
      clientProfileId: 'brand-a',
      draftKey: DRAFT_ID,
      request: 'Uma peça de lançamento',
      intent,
      format: '4:5',
      settings: { formatMode: 'auto', targetFormats: [...targetFormats] },
    });
  }
});

it('expõe somente portas de recibo, criação e leitura — sem geração', () => {
  const backend = memoryTextImport(makeDraft(), makeContext());
  expect(Object.keys(backend.ports).sort()).toEqual(
    ['createDraft', 'loadReceipt', 'readWork', 'saveReceipt'],
  );
});
