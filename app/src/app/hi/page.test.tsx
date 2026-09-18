import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HiPage, { metadata } from './page';

vi.mock('@/components/guest-home/LocalPublicHomeFallback', () => ({
  default: () => <main id="main">fallback</main>,
}));

vi.mock('@/components/guest-home/AdscaleGuestHome', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="island" data-attachments={String(props.attachmentsEnabled)} />
  ),
}));

describe('HiPage', () => {
  afterEach(() => {
    delete process.env.PUBLIC_STUDIO_HOME_ENABLED;
    delete process.env.PUBLIC_STUDIO_IMPORT_ENABLED;
    delete process.env.PUBLIC_STUDIO_ATTACHMENTS_ENABLED;
  });

  it('serve o fallback local com a página desligada', () => {
    render(<HiPage />);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('rejeita flags inconsistentes em vez de servir a rota', () => {
    process.env.PUBLIC_STUDIO_HOME_ENABLED = 'true';
    expect(() => HiPage()).toThrow('public_studio_import_required');
  });

  it('serve a ilha interativa com a capacidade de anexos da flag', () => {
    process.env.PUBLIC_STUDIO_HOME_ENABLED = 'true';
    process.env.PUBLIC_STUDIO_IMPORT_ENABLED = 'true';
    render(<HiPage />);
    expect(screen.getByTestId('island')).toHaveAttribute('data-attachments', 'false');
  });

  it('expõe metadata canônica da entrada pública', () => {
    expect(metadata.title).toBe('Adscale — comece sua próxima criação');
    expect(metadata.alternates).toEqual({
      canonical: 'https://adscale.jhonatansoares.com/hi',
    });
  });
});
