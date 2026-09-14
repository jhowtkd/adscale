# Creative Work Layerization — Paid Provider Smoke (2026-08-28)

## Scope

One explicitly authorized Seedream layer-decomposition invocation against a
synthetic ADScale-owned asset. Zero automatic retries. This is the paid-provider
gate only; it does not replace the separate human PSD review.

## Result

| Field | Value |
|---|---|
| Ran at | 2026-08-28T10:14:47.940Z |
| Model | `bytedance/seedream-v5.0-pro/layer-decomposition` |
| Source asset | synthetic (deterministic SVG rasterized to PNG), no client brand |
| Invocations | 1 |
| Duration | ~60 s |
| Canvas | 1024 x 1024 |
| Layers | 5 (1 base + 4 ordered) |

## Layer Contract

| Order | isBase | Name | bbox (x,y,w,h) |
|---|---|---|---|
| 0 | yes | Base | 0,0,1024,1024 |
| 1 | no | Base background | 70,74,883,877 |
| 2 | no | Bottom text element | 108,870,558,31 |
| 3 | no | Cyan circle | 109,109,140,140 |
| 4 | no | White card panel | 117,359,788,302 |

Every layer downloaded through the production `downloadSeedreamLayers` path:
PNG signature validated, non-base layers confirmed non-fully-transparent, and
bbox clipping checked against the canvas.

## Cost

- Expected billed amount: `$0.1575` for one 1K image, matching the prior
  2026-08-17 invoice (catalog `$0.022` is stale).
- The Atlas result payload carries no billing fields; the exact invoice line
  item must be confirmed in the Atlas Cloud dashboard. No key, signed URL, or
  provider response body is recorded here.

## Remaining gates

- Human PSD review (visible layer ordering, geometry, editability, compositing).
- Partner contract / retention approval before any real client asset.
