import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdscaleGuestHome from './AdscaleGuestHome';

const memoryDrafts = new Map<string, unknown>();
const saveDraftSpy = vi.fn(async (draft: { id: string }) => {
  memoryDrafts.set(draft.id, draft);
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

describe('AdscaleGuestHome', () => {
  beforeEach(() => {
    memoryDrafts.clear();
    saveDraftSpy.mockClear();
    stubDialog();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it('usa o landmark apontado pelo skip link global', () => {
    render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('desliga anexos de forma honesta quando a capacidade está off', () => {
    const { container } = render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    expect(screen.queryByRole('button', { name: /anexar/i })).toBeNull();
    expect(container.querySelector('#ag-file-input')).toBeNull();
    fireEvent.drop(container.querySelector('#ag-composer')!, {
      dataTransfer: { files: [new File(['x'], 'a.png', { type: 'image/png' })], types: ['Files'] },
    });
    expect(container.querySelectorAll('.ag-file-chip')).toHaveLength(0);
  });

  it('preenche o pedido a partir de um exemplo e permite editar', () => {
    render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    fireEvent.click(screen.getAllByRole('button', { name: /usar este exemplo/i })[0]);
    const field = screen.getByLabelText('Descreva o que você precisa criar') as HTMLTextAreaElement;
    expect(field.value).toContain('Quero um anúncio');
    fireEvent.change(field, { target: { value: 'Meu pedido editado' } });
    expect(field.value).toBe('Meu pedido editado');
  });

  it('não consulta dados privados durante a visita', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
      fireEvent.click(screen.getAllByRole('button', { name: /usar este exemplo/i })[0]);
      fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
      const forbidden = fetchSpy.mock.calls
        .map(([input]) => String(input))
        .filter((url) => /\/api\/(client-profiles|creative-work|campaigns|billing)(\/|$)/.test(url));
      expect(forbidden).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('mostra marcação do visitante como texto literal', async () => {
    render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    fireEvent.change(screen.getByLabelText('Descreva o que você precisa criar'), {
      target: { value: '<img src=x onerror=alert(1)>' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(screen.getByRole('dialog').querySelector('img')).toBeNull();
  });

  it('remontagem e clique duplo não duplicam salvamento nem diálogo', async () => {
    const first = render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    first.unmount();
    render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    fireEvent.change(screen.getByLabelText('Descreva o que você precisa criar'), {
      target: { value: 'Anúncio de lançamento' },
    });
    const continueButtons = screen.getAllByRole('button', { name: /continuar/i });
    fireEvent.click(continueButtons[0]);
    fireEvent.click(continueButtons[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const authButtons = screen.getAllByRole('button', { name: /entrar e continuar/i });
    fireEvent.click(authButtons[0]);
    fireEvent.click(authButtons[0]);
    await waitFor(() => expect(saveDraftSpy).toHaveBeenCalledTimes(1));
  });
});
