import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUEST_EVENT_ALLOWLIST,
  buildGuestEventPayload,
  isAllowedGuestEvent,
  recordGuestDraftImported,
} from './telemetry';

describe('guest telemetry allowlist', () => {
  const storage = new Map<string, string>();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
      },
    });
  });

  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it('permite somente o evento de importação verificada', () => {
    expect([...GUEST_EVENT_ALLOWLIST]).toEqual(['guest_draft_imported']);
    expect(isAllowedGuestEvent('guest_draft_imported')).toBe(true);
    expect(isAllowedGuestEvent('guest_home_viewed')).toBe(false);
    expect(isAllowedGuestEvent('credit_spend')).toBe(false);
  });

  it('payload carrega só agregados: sem pedido, arquivo, e-mail ou bytes', () => {
    const payload = buildGuestEventPayload({
      workId: 'work-1',
      referenceCount: 2,
      request: 'Anúncio secreto da Acme',
      fileNames: ['briefing.pdf'],
      email: 'dono@acme.test',
      bytes: 'aGVsbG8=',
    } as unknown as { workId: string; referenceCount: number });
    expect(payload).toEqual({
      eventKey: 'guest_draft_imported',
      properties: { creativeWorkId: 'work-1', origin: 'public_home', outputCount: 2 },
    });
    const serialized = JSON.stringify(payload);
    for (const secret of ['Anúncio secreto', 'briefing.pdf', 'dono@acme.test', 'aGVsbG8=']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('evento fora da allowlist nunca dispara fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(() => buildGuestEventPayload({ workId: '', referenceCount: 0 })).toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('emite uma vez por Trabalho mesmo em retry ou recarga', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    recordGuestDraftImported({ workId: 'work-1', referenceCount: 1 });
    recordGuestDraftImported({ workId: 'work-1', referenceCount: 1 });
    recordGuestDraftImported({ workId: 'work-2', referenceCount: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).properties).toEqual({
      creativeWorkId: 'work-1', origin: 'public_home', outputCount: 1,
    });
  });

  it('falha de analytics nunca lança nem bloqueia', () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(() => recordGuestDraftImported({ workId: 'work-9', referenceCount: 0 })).not.toThrow();
  });

  it('resposta 401 de visitante não lança', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    await expect((async () => recordGuestDraftImported({ workId: 'work-7', referenceCount: 0 }))())
      .resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
