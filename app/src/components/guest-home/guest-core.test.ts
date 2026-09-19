import { describe, expect, it } from 'vitest';
import {
  buildResumePath, createDraft, DRAFT_TTL, escapeHtml, getExample,
  MAX_FILE_BYTES, newDraftId, parseDraft, selectFiles, UUID_PATTERN, validateRequest,
} from './guest-core.mjs';

const now = 1789680000000;
const id = 'a216280c-2a0c-43dd-8eae-032203bf99cc';
const file = (name = 'referencia.png', type = 'image/png', size = 500) =>
  new File([new Uint8Array(size)], name, { type, lastModified: now });

describe('guest-core (portado do pacote + regras de retomada)', () => {
  it('rejeita pedido vazio e acima de 4000 caracteres', () => {
    expect(validateRequest('  ')).toBeTruthy();
    expect(validateRequest('a'.repeat(4001))).toBeTruthy();
    expect(validateRequest('Criar um anúncio de lançamento.')).toBeNull();
  });

  it('anexos aceitam PNG, JPEG e WebP; limite de 10MB e três arquivos', () => {
    const result = selectFiles([], [
      file(),
      file('vetor.svg', 'image/svg+xml'),
      file('grande.jpg', 'image/jpeg', MAX_FILE_BYTES + 1),
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(selectFiles(
      [file('a.png'), file('b.png')], [file('c.png'), file('d.png')],
    ).files).toHaveLength(3);
  });

  it('não duplica arquivos repetidos', () => {
    expect(selectFiles([file()], [file()]).files).toHaveLength(1);
  });

  it('rascunho preserva pedido, intenção e exemplo, com expiração de 24h', () => {
    const draft = createDraft(
      { request: '  Minha criação  ', intent: 'single', exampleId: 'product', files: [] }, id, now);
    expect(draft.request).toBe('Minha criação');
    expect(draft.expiresAt).toBe(now + DRAFT_TTL);
    expect(parseDraft(draft, now)?.exampleId).toBe('product');
  });

  it('rejeita rascunhos inválidos, adulterados, futuros ou expirados', () => {
    const draft = createDraft({ request: 'Meu pedido', intent: 'single', files: [] }, id, now);
    for (const bad of [null, {}, { ...draft, intent: 'admin' }, { ...draft, id: '../../' },
      { ...draft, version: 2 }, { ...draft, expiresAt: now - 1 }, { ...draft, createdAt: now + 600000 }]) {
      expect(parseDraft(bad, now)).toBeNull();
    }
  });

  it('retomada transporta somente identidade opaca, intenção e entrada explícita', () => {
    const path = buildResumePath(id, 'single');
    expect(path.startsWith('/?')).toBe(true);
    const query = new URL(path, 'https://example.com').searchParams;
    expect(query.get('guestDraft')).toBe(id);
    expect(query.get('intent')).toBe('single');
    expect(query.get('compose')).toBe('1');
    expect(query.get('fresh')).toBe('1');
    expect(query.has('request')).toBe(false);
    expect(() => buildResumePath('//attacker.test', 'single')).toThrow();
  });

  it('exemplos são curadoria; identificador desconhecido retorna nulo', () => {
    expect(getExample('product')?.intent).toBe('single');
    expect(getExample('not-found')).toBeNull();
  });

  it('rejeita tamanhos malformados em rascunhos persistidos', () => {
    const draft = createDraft({ request: 'Meu pedido', intent: 'single', files: [] }, id, now);
    for (const size of [NaN, Infinity, '500', undefined]) {
      expect(parseDraft({ ...draft, files: [{ ...file('x.png'), size }] }, now)).toBeNull();
    }
  });

  it('identificadores opacos são UUIDs únicos', () => {
    const ids = Array.from({ length: 100 }, () => newDraftId());
    expect(new Set(ids).size).toBe(100);
    expect(ids.every((value) => UUID_PATTERN.test(value))).toBe(true);
  });

  it('escapa marcação antes de qualquer conteúdo do usuário chegar a um diálogo', () => {
    expect(escapeHtml(`<img title="x" onerror='bad'>&`))
      .toBe('&lt;img title=&quot;x&quot; onerror=&#39;bad&#39;&gt;&amp;');
  });

  it('transporta somente identidade de retomada na URL', () => {
    const draft = createDraft({
      request: 'Mensagem privada de lançamento', intent: 'single', files: [],
    }, id, now);
    const path = buildResumePath(draft.id, draft.intent);
    expect(path).not.toContain('Mensagem');
    expect(new URL(path, 'https://app.example').searchParams.get('guestDraft')).toBe(id);
  });

  it('não aceita uma referência feita apenas de metadados', () => {
    const draft = createDraft({ request: 'Uma peça', intent: 'single', files: [] }, id, now);
    expect(parseDraft({ ...draft, files: [{
      name: 'imagem.png', type: 'image/png', size: 32, lastModified: now,
    }] }, now)).toBeNull();
  });

  it('aceita arquivos reais reconstruídos a partir de Blob + metadados', () => {
    const draft = createDraft({ request: 'Uma peça', intent: 'single', files: [] }, id, now);
    const blob = new Blob([new Uint8Array(32)], { type: 'image/png' });
    const restored = new File([blob], 'imagem.png', { type: 'image/png', lastModified: now });
    expect(parseDraft({ ...draft, files: [restored] }, now)?.files).toHaveLength(1);
  });
});
