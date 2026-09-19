import { describe, expect, it } from 'vitest';
import { readPublicStudioFlags, publicStudioRewrites } from './public-studio-config';

describe('public studio routing on the same Render service', () => {
  it('não encaminha a home nem seus assets para outro servidor', () => {
    const rules = publicStudioRewrites();
    const all = [...rules.beforeFiles, ...rules.afterFiles, ...rules.fallback];
    expect(rules.beforeFiles).toEqual([]);
    expect(all.some(({ source }) => source === '/hi' || source === '/hi/')).toBe(false);
    expect(all.every(({ destination }) =>
      destination.startsWith('/') && !destination.startsWith('//'))).toBe(true);
  });
  it('mantém compatibilidade de assets usando destinos locais', () => {
    expect(publicStudioRewrites().afterFiles).toContainEqual({
      source: '/hi/assets/:path*', destination: '/adscale-guest/legacy-assets/:path*',
    });
    expect(publicStudioRewrites().afterFiles).toContainEqual({
      source: '/Adscale.svg', destination: '/adscale-guest/logo.svg',
    });
  });
  it('recusa publicar home sem consumidor', () => {
    expect(() => readPublicStudioFlags({ PUBLIC_STUDIO_HOME_ENABLED: 'true' })).toThrow();
  });
  it('permite drenar importações com o fallback local', () => {
    expect(readPublicStudioFlags({ PUBLIC_STUDIO_IMPORT_ENABLED: 'true' }))
      .toEqual({ homeEnabled: false, importEnabled: true, attachmentsEnabled: false });
  });
});
