import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ptBR from '../../../messages/pt-BR.json';
import LocalPublicHomeFallback from './LocalPublicHomeFallback';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    const msgs = (ptBR as Record<string, Record<string, string>>).publicHome;
    return (key: string) => msgs[key] ?? key;
  },
}));

describe('LocalPublicHomeFallback', () => {
  it('usa o landmark apontado pelo skip link global', async () => {
    render(await LocalPublicHomeFallback());
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('mantém a entrada disponível com login funcional', async () => {
    render(await LocalPublicHomeFallback());
    expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('Seu Estúdio continua por aqui.');
    expect(screen.getByRole('link', { name: 'Entrar no Estúdio' }))
      .toHaveAttribute('href', '/login?callbackUrl=%2F');
  });
});
