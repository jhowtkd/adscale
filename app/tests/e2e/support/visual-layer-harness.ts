import type { Page } from "@playwright/test";

export type VisualLayerComposition = "sticky-popover-toast" | "shell-backdrop-overlay-toast";

const canonicalLayers = {
  base: 0,
  raised: 10,
  sticky: 20,
  shell: 30,
  popover: 50,
  backdrop: 60,
  overlay: 70,
  toast: 80,
};

export async function mountVisualLayerHarness(
  page: Page,
  composition: VisualLayerComposition = "sticky-popover-toast",
) {
  const secondary = composition === "sticky-popover-toast"
    ? `<aside data-layer="sticky">Sticky</aside><div data-layer="popover">Popover</div>`
    : `<header data-layer="shell">Shell</header><div data-layer="backdrop"></div><section data-layer="overlay">Overlay</section>`;
  await page.setContent(`<!doctype html><html><head><style>
    :root { color-scheme: light; font-family: system-ui; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f3f5f1; color: #172018; }
    main { position: relative; z-index: ${canonicalLayers.base}; margin: 72px 24px; padding: 32px; background: white; border: 1px solid #cbd3c9; }
    [data-layer] { position: fixed; padding: 12px 16px; border: 1px solid #667064; background: white; }
    [data-layer="sticky"] { z-index: ${canonicalLayers.sticky}; top: 12px; left: 12px; right: 12px; }
    [data-layer="shell"] { z-index: ${canonicalLayers.shell}; top: 0; left: 0; right: 0; }
    [data-layer="popover"] { z-index: ${canonicalLayers.popover}; top: 64px; right: 24px; box-shadow: 0 8px 24px #0002; }
    [data-layer="backdrop"] { z-index: ${canonicalLayers.backdrop}; inset: 0; background: #10181088; border: 0; }
    [data-layer="overlay"] { z-index: ${canonicalLayers.overlay}; inset: 20% 12%; display: grid; place-items: center; }
    [data-layer="toast"] { z-index: ${canonicalLayers.toast}; right: 20px; bottom: 20px; background: #e8f5e8; }
  </style></head><body><main><h1>Visual layer harness</h1><p data-synthetic>example.test synthetic composition</p></main>${secondary}<div data-layer="toast">Toast</div></body></html>`);
}
