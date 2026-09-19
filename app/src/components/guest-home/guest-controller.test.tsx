import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdscaleGuestHome from './AdscaleGuestHome';

const memoryDrafts = new Map<string, { id: string; request: string }>();
const saveDraftSpy = vi.fn(async (draft: { id: string; request: string }) => {
  memoryDrafts.set(draft.id, { ...draft });
});

vi.mock('./guest-store.mjs', () => ({
  saveDraft: (...args: unknown[]) => saveDraftSpy(...args),
  loadDraft: async (id: string) => memoryDrafts.get(id) ?? null,
  loadLastDraft: async () => null,
  removeDraft: async (id: string) => { memoryDrafts.delete(id); },
  pruneExpiredDrafts: async () => {},
}));

function stubDialog() {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  }) as never;
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  }) as never;
}

function clickAction(container: HTMLElement, action: string) {
  const target = container.querySelector(`[data-action="${action}"]`);
  if (!target) throw new Error(`missing action ${action}`);
  fireEvent.click(target);
}

describe('guest-controller draft identity', () => {
  beforeEach(() => {
    memoryDrafts.clear();
    saveDraftSpy.mockClear();
    stubDialog();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it('retry sem edição mantém o UUID', async () => {
    const { container } = render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    fireEvent.change(screen.getByLabelText('Descreva o que você precisa criar'), {
      target: { value: 'Anúncio de lançamento' },
    });
    clickAction(container, 'continue');
    clickAction(container, 'authenticate');
    await vi.waitFor(() => expect(saveDraftSpy).toHaveBeenCalledTimes(1));
    clickAction(container, 'close');
    clickAction(container, 'continue');
    clickAction(container, 'authenticate');
    await vi.waitFor(() => expect(saveDraftSpy).toHaveBeenCalledTimes(2));
    const [first, second] = saveDraftSpy.mock.calls.map(([draft]) => draft as { id: string });
    expect(second.id).toBe(first.id);
    expect(memoryDrafts.size).toBe(1);
  });

  it('edição depois de salvar gera outro UUID sem sobrescrever o anterior', async () => {
    const { container } = render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    const field = screen.getByLabelText('Descreva o que você precisa criar');
    fireEvent.change(field, { target: { value: 'Primeira versão' } });
    clickAction(container, 'continue');
    clickAction(container, 'authenticate');
    await vi.waitFor(() => expect(saveDraftSpy).toHaveBeenCalledTimes(1));
    clickAction(container, 'close');
    fireEvent.change(field, { target: { value: 'Segunda versão' } });
    clickAction(container, 'continue');
    clickAction(container, 'authenticate');
    await vi.waitFor(() => expect(saveDraftSpy).toHaveBeenCalledTimes(2));
    const [first, second] = saveDraftSpy.mock.calls.map(([draft]) => draft as { id: string });
    expect(second.id).not.toBe(first.id);
    expect(memoryDrafts.size).toBe(2);
    expect(memoryDrafts.get(first.id)?.request).toBe('Primeira versão');
    expect(memoryDrafts.get(second.id)?.request).toBe('Segunda versão');
  });
});
