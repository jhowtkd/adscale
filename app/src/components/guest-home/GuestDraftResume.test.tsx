import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ptBR from '../../../messages/pt-BR.json';
import GuestDraftResume from './GuestDraftResume';
import type { GuestDraft } from './guest-core.mjs';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const msgs = namespace ? (ptBR as Record<string, Record<string, string>>)[namespace] || {} : {};
    return (key: string, values?: Record<string, string | number>) => {
      let text = msgs[key] ?? key;
      for (const [name, value] of Object.entries(values ?? {})) {
        text = text.replace(`{${name}}`, String(value));
      }
      return text;
    };
  },
}));

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';

function makeDraft(overrides: Partial<GuestDraft> = {}): GuestDraft {
  return {
    version: 1,
    id: DRAFT_ID,
    request: 'Anúncio de lançamento',
    intent: 'single',
    exampleId: null,
    files: [],
    createdAt: 1789680000000,
    expiresAt: 1789680000000 + 86400000,
    ...overrides,
  };
}

describe('GuestDraftResume', () => {
  it('mostra pedido, marca e referências', () => {
    render(<GuestDraftResume
      draft={makeDraft({ files: [new File(['a'], 'a.png', { type: 'image/png' })] })}
      brandName="Acme"
      state="review"
      error={null}
      canConfirm
      onConfirm={() => {}}
      onDiscard={() => {}}
      onCopy={() => {}}
    />);
    expect(screen.getByText('Pedido da página inicial')).toBeInTheDocument();
    expect(screen.getByText('Anúncio de lançamento')).toBeInTheDocument();
    expect(screen.getByText('Marca: Acme')).toBeInTheDocument();
    expect(screen.getByText('1 referência')).toBeInTheDocument();
  });

  it('habilita a confirmação somente quando permitido', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<GuestDraftResume
      draft={makeDraft()}
      brandName={null}
      state="review"
      error={null}
      canConfirm={false}
      onConfirm={onConfirm}
      onDiscard={() => {}}
      onCopy={() => {}}
    />);
    expect(screen.getByRole('button', { name: 'Usar este pedido' })).toBeDisabled();

    rerender(<GuestDraftResume
      draft={makeDraft()}
      brandName="Acme"
      state="review"
      error={null}
      canConfirm
      onConfirm={onConfirm}
      onDiscard={() => {}}
      onCopy={() => {}}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('trava a confirmação durante a transferência e mostra erro', () => {
    render(<GuestDraftResume
      draft={makeDraft()}
      brandName="Acme"
      state="creating"
      error="Não foi possível importar agora."
      canConfirm
      onConfirm={() => {}}
      onDiscard={() => {}}
      onCopy={() => {}}
    />);
    expect(screen.getByRole('button', { name: 'Transferindo…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível importar agora.');
  });

  it('descarta a cópia local somente com confirmação explícita', () => {
    const onDiscard = vi.fn();
    render(<GuestDraftResume
      draft={makeDraft()}
      brandName="Acme"
      state="review"
      error={null}
      canConfirm
      onConfirm={() => {}}
      onDiscard={onDiscard}
      onCopy={() => {}}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cópia local' }));
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Manter' }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirmar descarte' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cópia local' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar descarte' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('copia o texto do pedido', () => {
    const onCopy = vi.fn();
    render(<GuestDraftResume
      draft={makeDraft()}
      brandName="Acme"
      state="review"
      error={null}
      canConfirm
      onConfirm={() => {}}
      onDiscard={() => {}}
      onCopy={onCopy}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
