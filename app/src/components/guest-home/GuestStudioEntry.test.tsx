import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptBR from '../../../messages/pt-BR.json';
import GuestStudioEntry from './GuestStudioEntry';
import type { GuestDraft } from './guest-core.mjs';

const DRAFT_ID = 'aa111111-1111-4111-8111-111111111111';
const DRAFT_ID_2 = 'bb222222-2222-4222-8222-222222222222';

type Profile = { id: string; name: string };
const mockBrandState = vi.hoisted(() => ({
  current: {
    profiles: [] as Profile[],
    activeProfile: null as Profile | null,
    activeClientProfileId: null as string | null,
    requiresSelection: false,
    isLoading: false,
    isError: false,
    selectProfile: vi.fn(),
  },
}));
const mockLoadDraft = vi.fn();
const mockRemoveDraft = vi.fn();
const mockImportDraft = vi.fn();
const mockHookArgs = vi.fn();
const mockRecordImport = vi.fn();
const mockPush = vi.fn();

vi.mock('./guest-store.mjs', () => ({
  loadDraft: (...args: unknown[]) => mockLoadDraft(...args),
  removeDraft: (...args: unknown[]) => mockRemoveDraft(...args),
  saveDraft: vi.fn(),
  loadLastDraft: vi.fn(),
  pruneExpiredDrafts: vi.fn(),
}));
vi.mock('@/lib/hooks/use-active-client-profile', () => ({
  useActiveClientProfile: () => mockBrandState.current,
}));
vi.mock('@/components/layout/ActiveBrandSwitcher', () => ({
  default: () => (
    <div data-testid="brand-switcher">
      {mockBrandState.current.profiles.map((profile: Profile) => (
        <button
          key={profile.id}
          type="button"
          onClick={() => mockBrandState.current.selectProfile(profile.id)}
        >
          {profile.name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('./useGuestDraftImport', () => ({
  useGuestDraftImport: (...args: unknown[]) => {
    mockHookArgs(...args);
    return { importDraft: (...call: unknown[]) => mockImportDraft(...call) };
  },
}));
vi.mock('@/lib/guest-home/telemetry', () => ({
  recordGuestDraftImported: (...args: unknown[]) => mockRecordImport(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
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

function makeDraft(id: string, request = 'Anúncio de lançamento'): GuestDraft {
  return {
    version: 1, id, request, intent: 'single', exampleId: null, files: [],
    createdAt: 1789680000000, expiresAt: 1789680000000 + 86400000,
  };
}

function singleBrand() {
  mockBrandState.current = {
    profiles: [{ id: 'brand-1', name: 'Acme' }],
    activeProfile: { id: 'brand-1', name: 'Acme' },
    activeClientProfileId: 'brand-1',
    requiresSelection: false,
    isLoading: false,
    isError: false,
    selectProfile: vi.fn(),
  };
}

function renderEntry(props: Partial<Parameters<typeof GuestStudioEntry>[0]> = {}) {
  const client = new QueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <GuestStudioEntry
        guestDraftId={DRAFT_ID}
        userId="user-1"
        workspaceId="ws-1"
        importEnabled
        attachmentsEnabled
        conflict={null}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, client };
}

describe('GuestStudioEntry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLoadDraft.mockReset().mockResolvedValue(makeDraft(DRAFT_ID));
    mockRemoveDraft.mockReset().mockResolvedValue(undefined);
    mockImportDraft.mockReset().mockResolvedValue({ kind: 'blocked', code: 'import_not_available' });
    mockHookArgs.mockReset();
    mockRecordImport.mockReset();
    mockPush.mockReset();
    singleBrand();
    window.history.replaceState({}, '', '/');
  });

  it('mostra o pedido com a marca única e confirma habilitado', async () => {
    renderEntry();
    expect(await screen.findByText('Anúncio de lançamento')).toBeInTheDocument();
    expect(screen.getByText('Marca: Acme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar este pedido' })).toBeEnabled();
  });

  it('pedido ausente mostra recuperação sem confirmar', async () => {
    mockLoadDraft.mockResolvedValue(null);
    renderEntry();
    expect(await screen.findByText('Pedido indisponível neste navegador.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à página inicial' })).toHaveAttribute('href', '/hi');
    expect(screen.queryByRole('button', { name: 'Usar este pedido' })).toBeNull();
    expect(mockImportDraft).not.toHaveBeenCalled();
  });

  it('zero marcas oferece o fluxo existente sem perder o pedido', async () => {
    mockBrandState.current = { ...mockBrandState.current, profiles: [], activeProfile: null, activeClientProfileId: null };
    renderEntry();
    expect(await screen.findByText('Você ainda não tem uma marca.')).toBeInTheDocument();
    expect(screen.getByTestId('brand-switcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar este pedido' })).toBeDisabled();
    expect(screen.getByText('Anúncio de lançamento')).toBeInTheDocument();
  });

  it('várias marcas exigem escolha real, sem usar a primeira por conveniência', async () => {
    mockBrandState.current = {
      profiles: [{ id: 'brand-1', name: 'Acme' }, { id: 'brand-2', name: 'Beta' }],
      activeProfile: null,
      activeClientProfileId: null,
      requiresSelection: true,
      isLoading: false,
      isError: false,
      selectProfile: vi.fn(),
    };
    const { rerender, client } = renderEntry();
    expect(await screen.findByText('Escolha a marca que deve receber este pedido.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar este pedido' })).toBeDisabled();

    fireEvent.click(within(screen.getByTestId('brand-switcher')).getByRole('button', { name: 'Beta' }));
    expect(mockBrandState.current.selectProfile).toHaveBeenCalledWith('brand-2');

    mockBrandState.current = {
      ...mockBrandState.current,
      activeProfile: { id: 'brand-2', name: 'Beta' },
      activeClientProfileId: 'brand-2',
      requiresSelection: false,
    };
    rerender(
      <QueryClientProvider client={client}>
        <GuestStudioEntry guestDraftId={DRAFT_ID} userId="user-1" workspaceId="ws-1" importEnabled attachmentsEnabled conflict={null} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Usar este pedido' })).toBeEnabled());
    expect(mockImportDraft).not.toHaveBeenCalled();
  });

  it('falha ao carregar marcas oferece nova tentativa sem importar', async () => {
    mockBrandState.current = { ...mockBrandState.current, isError: true };
    const { client } = renderEntry();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    expect(await screen.findByText('Não foi possível carregar suas marcas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(invalidate).toHaveBeenCalled();
    expect(mockImportDraft).not.toHaveBeenCalled();
  });

  it('montar e trocar de marca não dispara nenhuma criação', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      renderEntry();
      await screen.findByText('Anúncio de lançamento');
      fireEvent.click(within(screen.getByTestId('brand-switcher')).getByRole('button', { name: 'Acme' }));
      expect(mockImportDraft).not.toHaveBeenCalled();
      expect(fetchSpy.mock.calls.map(([input]) => String(input)).filter((url) =>
        url.includes('/api/creative-work'))).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('importação desligada mostra recuperação com copiar e descartar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true });
    renderEntry({ importEnabled: false });
    expect(await screen.findByText('A importação está desligada no momento.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Anúncio de lançamento'));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cópia local' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar descarte' }));
    await waitFor(() => expect(mockRemoveDraft).toHaveBeenCalledWith(DRAFT_ID));
    expect(mockImportDraft).not.toHaveBeenCalled();
  });

  it('sem workspace preserva o pedido com recuperação', async () => {
    renderEntry({ userId: null, workspaceId: null });
    expect(await screen.findByText('Sua conta ainda não tem um espaço de trabalho.')).toBeInTheDocument();
    expect(screen.getByText('Anúncio de lançamento')).toBeInTheDocument();
    expect(screen.queryByTestId('brand-switcher')).toBeNull();
    expect(mockImportDraft).not.toHaveBeenCalled();
  });

  it('conflito oferece abrir o existente ou continuar com o pedido', async () => {
    window.history.replaceState({}, '', `/?guestDraft=${DRAFT_ID}&workId=work-9&compose=1`);
    renderEntry({ conflict: { workId: 'work-9' } });
    expect(await screen.findByText('Você tem um trabalho aberto e um pedido da página inicial.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir o trabalho existente' })).toHaveAttribute(
      'href', '/?workId=work-9&compose=1');
    expect(screen.getByRole('link', { name: 'Continuar com o pedido da página inicial' })).toHaveAttribute(
      'href', `/?guestDraft=${DRAFT_ID}&compose=1`);
    expect(mockLoadDraft).not.toHaveBeenCalled();
    expect(mockImportDraft).not.toHaveBeenCalled();
  });

  it('confirmar congela o contexto; mudança no meio cancela o resultado tardio', async () => {
    let resolveImport!: (value: unknown) => void;
    mockImportDraft.mockImplementation(() => new Promise((resolve) => { resolveImport = resolve; }));
    const { rerender, client } = renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    await waitFor(() => expect(mockImportDraft).toHaveBeenCalledTimes(1));
    expect(mockImportDraft).toHaveBeenCalledWith({
      draft: expect.objectContaining({ id: DRAFT_ID }),
      context: { userId: 'user-1', workspaceId: 'ws-1', clientProfileId: 'brand-1' },
    });

    rerender(
      <QueryClientProvider client={client}>
        <GuestStudioEntry guestDraftId={DRAFT_ID} userId="user-2" workspaceId="ws-1" importEnabled attachmentsEnabled conflict={null} />
      </QueryClientProvider>,
    );
    resolveImport({ kind: 'verified', workId: 'work-1' });
    expect(await screen.findByText('A sessão ou a marca mudou durante a importação. Revise e tente novamente.')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('duplo clique confirma uma única vez', async () => {
    let resolveImport!: (value: unknown) => void;
    mockImportDraft.mockImplementation(() => new Promise((resolve) => { resolveImport = resolve; }));
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    const confirm = screen.getByRole('button', { name: 'Usar este pedido' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    resolveImport({ kind: 'verified', workId: 'work-1' });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/?workId=work-1&compose=1'));
    expect(mockImportDraft).toHaveBeenCalledTimes(1);
  });

  it('troca de pedido recarrega e ignora resposta antiga', async () => {
    let resolveFirst!: (value: unknown) => void;
    mockLoadDraft.mockImplementation((id: string) => id === DRAFT_ID
      ? new Promise((resolve) => { resolveFirst = resolve; })
      : Promise.resolve(makeDraft(DRAFT_ID_2, 'Segundo pedido')));
    const { rerender, client } = renderEntry();
    rerender(
      <QueryClientProvider client={client}>
        <GuestStudioEntry guestDraftId={DRAFT_ID_2} userId="user-1" workspaceId="ws-1" importEnabled attachmentsEnabled conflict={null} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Segundo pedido')).toBeInTheDocument();
    resolveFirst(makeDraft(DRAFT_ID, 'Primeiro pedido'));
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Primeiro pedido')).toBeNull();
  });

  it('importação bloqueada mantém o pedido visível', async () => {
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    expect(await screen.findByText('Não foi possível importar agora. Seu pedido continua guardado.')).toBeInTheDocument();
    expect(screen.getByText('Anúncio de lançamento')).toBeInTheDocument();
  });

  it('importação verificada abre o trabalho', async () => {
    mockImportDraft.mockResolvedValue({ kind: 'verified', workId: 'work-1' });
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/?workId=work-1&compose=1'));
  });

  it('repasse de attachmentsEnabled chega ao hook', async () => {
    renderEntry({ attachmentsEnabled: false });
    await screen.findByText('Anúncio de lançamento');
    expect(mockHookArgs).toHaveBeenCalledWith(false);
  });

  it('parcial oferece retomar só os pendentes', async () => {
    mockImportDraft.mockResolvedValueOnce({ kind: 'partial', workId: 'work-1', pendingFileIds: ['f1', 'f2'] });
    mockImportDraft.mockResolvedValue({ kind: 'verified', workId: 'work-1' });
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    expect(await screen.findByText('Faltam 2 referências.')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar referências pendentes' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/?workId=work-1&compose=1'));
    expect(mockImportDraft).toHaveBeenCalledTimes(2);
    expect(mockImportDraft.mock.calls[1][0]).not.toHaveProperty('textOnly');
  });

  it('texto explícito após parcial importa sem as referências', async () => {
    mockImportDraft.mockResolvedValueOnce({ kind: 'partial', workId: 'work-1', pendingFileIds: ['f1'] });
    mockImportDraft.mockResolvedValue({ kind: 'verified', workId: 'work-1' });
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    expect(await screen.findByText('Falta 1 referência.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Importar só o texto' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/?workId=work-1&compose=1'));
    expect(mockImportDraft.mock.calls[1][0]).toMatchObject({ textOnly: true });
  });

  it('verificação emite o evento de importação com o Trabalho', async () => {
    mockLoadDraft.mockResolvedValue({
      ...makeDraft(DRAFT_ID),
      files: [new File(['bytes'], 'ref.png', { type: 'image/png' })],
    });
    mockImportDraft.mockResolvedValue({ kind: 'verified', workId: 'work-1' });
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/?workId=work-1&compose=1'));
    expect(mockRecordImport).toHaveBeenCalledTimes(1);
    expect(mockRecordImport).toHaveBeenCalledWith({ workId: 'work-1', referenceCount: 1 });
  });

  it('falha de analytics não bloqueia nem duplica a importação', async () => {
    mockImportDraft.mockResolvedValue({ kind: 'verified', workId: 'work-1' });
    mockRecordImport.mockImplementationOnce(() => { throw new Error('analytics down'); });
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/?workId=work-1&compose=1'));
    expect(mockImportDraft).toHaveBeenCalledTimes(1);
  });

  it('parcial e bloqueio não emitem evento de importação', async () => {
    mockImportDraft.mockResolvedValueOnce({ kind: 'partial', workId: 'work-1', pendingFileIds: ['f1'] });
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    expect(await screen.findByText('Falta 1 referência.')).toBeInTheDocument();
    expect(mockRecordImport).not.toHaveBeenCalled();
  });

  it('anexos desligados não importam texto em silêncio', async () => {
    mockImportDraft.mockResolvedValue({ kind: 'blocked', code: 'attachments_disabled', workId: 'work-1' });
    renderEntry();
    await screen.findByText('Anúncio de lançamento');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pedido' }));
    expect(await screen.findByText(
      'Os anexos estão desligados. Seus arquivos continuam guardados; importe só o texto ou tente mais tarde.',
    )).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Anúncio de lançamento')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar só o texto' })).toBeInTheDocument();
  });
});
