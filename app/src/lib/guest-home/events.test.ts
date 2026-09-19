import { expect, it } from 'vitest';
import { sanitizePublicGuestEvent } from './events';

it('não transporta briefing nem nome de arquivo', () => {
  const result = sanitizePublicGuestEvent({ name: 'references_changed', detail: {
    referenceCount: 2, request: 'Informação privada', fileName: 'cliente.png',
  }});
  expect(result).toEqual({ name: 'references_changed', detail: { referenceCount: 2 } });
});

it('descarta nomes fora da allowlist', () => {
  expect(sanitizePublicGuestEvent({ name: 'request_typed', detail: { intent: 'single' } })).toBeNull();
  expect(sanitizePublicGuestEvent({ name: '', detail: {} })).toBeNull();
  expect(sanitizePublicGuestEvent(null as unknown as { name: string; detail: Record<string, unknown> })).toBeNull();
  expect(sanitizePublicGuestEvent({ name: 'home_viewed', detail: null as unknown as Record<string, unknown> })).toBeNull();
});

it('descarta campos sensíveis mesmo com nomes válidos', () => {
  const result = sanitizePublicGuestEvent({ name: 'continue_prepared', detail: {
    intent: 'single',
    request: 'Anúncio da cliente X',
    fileName: 'logo.png',
    fileUrl: 'https://cdn.example/logo.png',
    email: 'dona@example.com',
    bytes: 'aGVsbG8=',
    hasRequest: true,
    fileCount: 2,
    count: 2,
  }});
  expect(result).toEqual({ name: 'continue_prepared', detail: { intent: 'single' } });
});

it('valida cada campo permitido em vez de copiar', () => {
  expect(sanitizePublicGuestEvent({ name: 'intent_selected', detail: { intent: 'hologram' } }))
    .toEqual({ name: 'intent_selected', detail: {} });
  expect(sanitizePublicGuestEvent({ name: 'example_selected', detail: { exampleId: 'nope', intent: 'single' } }))
    .toEqual({ name: 'example_selected', detail: { intent: 'single' } });
  expect(sanitizePublicGuestEvent({ name: 'references_changed', detail: { referenceCount: 99 } }))
    .toEqual({ name: 'references_changed', detail: {} });
  expect(sanitizePublicGuestEvent({ name: 'references_changed', detail: { referenceCount: 1.5 } }))
    .toEqual({ name: 'references_changed', detail: {} });
  expect(sanitizePublicGuestEvent({ name: 'home_viewed', detail: { preview: 'yes' } }))
    .toEqual({ name: 'home_viewed', detail: {} });
});

it('preserva os campos permitidos válidos', () => {
  expect(sanitizePublicGuestEvent({
    name: 'example_selected', detail: { exampleId: 'product', intent: 'single' },
  })).toEqual({
    name: 'example_selected', detail: { intent: 'single', exampleId: 'product' },
  });
  expect(sanitizePublicGuestEvent({ name: 'home_viewed', detail: { preview: true } }))
    .toEqual({ name: 'home_viewed', detail: { preview: true } });
  expect(sanitizePublicGuestEvent({ name: 'references_changed', detail: { referenceCount: 3 } }))
    .toEqual({ name: 'references_changed', detail: { referenceCount: 3 } });
});
