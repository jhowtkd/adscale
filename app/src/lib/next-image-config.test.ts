import { describe, expect, it } from 'vitest';
import { getImgProps } from 'next/dist/shared/lib/get-img-props';
import defaultLoader from 'next/dist/shared/lib/image-loader';

// Exported config = withSentryConfig(withNextIntl(nextConfig)); the wrappers
// must not drop `images`. Next's own getImageProps decides whether a src goes
// through /_next/image, so a re-enabled optimizer is caught end to end.
async function loadConfig() {
  const mod = await import('../../next.config');
  const cfg = mod.default;
  return typeof cfg === 'function' ? await cfg('phase-production-build', { defaultConfig: {} }) : cfg;
}

describe('otimizador de imagens do Next', () => {
  it('fica desligado na config exportada', async () => {
    const cfg = await loadConfig();
    expect(cfg.images?.unoptimized).toBe(true);
    expect(cfg.images?.remotePatterns ?? []).toEqual([]);
  });

  it('não manda imagens próprias nem de terceiros ao /_next/image', async () => {
    const cfg = await loadConfig();
    const images = JSON.parse(JSON.stringify(cfg.images));
    const urls = [
      '/logo.png',
      'https://pub-abc123.r2.dev/brand/logo.png',
      'https://acct.r2.cloudflarestorage.com/bucket/a.webp',
      'https://example.com/third-party.jpg',
    ];
    const imgConf = {
      deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
      imageSizes: [32, 48, 64, 96, 128, 256, 384],
      path: '/_next/image', loader: 'default', dangerouslyAllowSVG: false,
      qualities: [75], ...images,
    };
    for (const src of urls) {
      const { props } = getImgProps({ src, alt: '', width: 100, height: 100 }, { defaultLoader, imgConf });
      expect(props.src, src).toBe(src);
      expect(props.srcSet ?? '').not.toContain('/_next/image');
    }
  });
});
