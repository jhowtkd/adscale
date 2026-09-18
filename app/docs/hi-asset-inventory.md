# /hi asset inventory (#439)

Cold inventory of the old marketing upstream
(`https://adscale-marketing.onrender.com`, fetched 2026-09-18) backing the
local aliases in `next.config.ts`. Every file below was copied byte-identical
into `app/public/hi-assets/`; the next.config aliases serve them with no
external dependency. #447's post-verification can diff against this table.

## Copied files

| Source URL (upstream) | Local path | Bytes | SHA-256 |
|---|---|---|---|
| `/Adscale.svg` | `hi-assets/Adscale.svg` | 10873 | `0ff3a13d8f46edec8d8501413f3a89350411d7c0fee7aa381237644618bc1fd1` |
| `/assets/index-BkZ2MeUj.js` | `hi-assets/assets/index-BkZ2MeUj.js` | 28140 | `23e47f947521d12263988b1f689ca9080402c1647ca7550033cffc160f242aaa` |
| `/assets/index-K2VpOfil.css` | `hi-assets/assets/index-K2VpOfil.css` | 39341 | `8cd19c0a7e0822b35416ca3c008ca7a2457d31fec0d8cd5041ea996673f67676` |
| `/assets/vendor-react-YsBxPMQB.js` | `hi-assets/assets/vendor-react-YsBxPMQB.js` | 140739 | `d02de345028df98bec329d03ee24a19f3cb1c3000adbbbf0ce64e742a00006f9` |
| `/assets/vendor-supabase-D3qGG-pJ.js` | `hi-assets/assets/vendor-supabase-D3qGG-pJ.js` | 1020 | `fd18fc825fd2b5d7da1c91872864d98e7e73103233673e820ad4da18f324b76a` |

## Upstream quirks (recorded, not fixed)

- The upstream `index.html` references bundles at `/hi/assets/*`, but those
  URLs return **404** on the upstream itself; the live bytes are served from
  root `/assets/*`. Our alias maps old-address `/hi/assets/:path*` to the
  local copies, so old addresses resolve honestly.
- `/hi/Adscale.svg` returns **404** on the upstream; only root `/Adscale.svg`
  exists. Both old addresses alias to the single local copy.
- The only nested asset reference inside the copied bundles is
  `"/hi/Adscale.svg"` (in `index-BkZ2MeUj.js`), covered by the alias above.
  Google Fonts links in the old HTML are not copied — the native `/hi` route
  never loads the old bundles; they exist solely as frozen old-address
  aliases. Total added weight: ~224K.

## Alias map (next.config.ts)

- `/Adscale.svg` → `/hi-assets/Adscale.svg`
- `/hi/Adscale.svg` → `/hi-assets/Adscale.svg`
- `/hi/assets/:path*` → `/hi-assets/assets/:path*`
