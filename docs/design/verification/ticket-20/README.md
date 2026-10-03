# Ticket 20 · Next image optimizer

All 34 `next/image` uses across 26 production files already pass `unoptimized`.
The global flag preserves their original URLs and transfer sizes; no thumbnail
pipeline or component changes are needed. The coordinator waived screenshots
because no screen relies on the optimizer.

Production builds before and after passed on Node 22.23.2 / Next 16.2.6.
Anonymous HTTP requests targeted the real standalone server with the review's
493,146-byte, 6324², 16-bit interlaced PNG (`w=640`, `q=75`). A temporary preload
served the local fixture for synthetic external/own-bucket hosts and blocked
other outbound requests; the Next optimizer and Sharp were unchanged.

| Case | Before | After |
| --- | --- | --- |
| External R2 host, 1 request | 200 PNG; RSS 238.48 → 682.42 MiB | 404 HTML; RSS 244.50 → 248.53 MiB |
| Own-bucket R2 host, 1 request | 200 PNG; upstream fetched | 404 HTML; no upstream fetch |
| R2 cloudflarestorage host, 4 concurrent | 200 PNG; RSS peak 1,939.80 MiB | 404 HTML; RSS peak 264.09 MiB |
| Total upstream fetches | 6 | 0 |

The fixed series ended at 254.08 MiB. Its maximum transient growth was 19.59 MiB
for HTML 404 rendering, versus 443.94 MiB for the first hostile decode before.
RSS is sampled every 10 ms and reflects allocator retention; this is not a
kernel-enforced memory limit. The review's direct `optimizeImage` probe bypasses
endpoint configuration, so it was adapted to anonymous HTTP for this check.

Source/caller audit found no other anonymous endpoint accepting arbitrary image
bytes/URLs for decoding. Share asset routes validate a token and redirect to
storage; upload/conversion routes require workspace access; Inngest jobs require
signed execution in production. Authenticated classic conversion risks remain
outside this ticket. No production/provider requests were made.

Validation: real exported-config/getImgProps regression tests (2/2), mutation
`unoptimized:false` rejected by both tests, focused ESLint, two production builds,
and convergence/destination gates passed. Full inventory, raw measurements and
reproduction scripts are in the ticket's Traycer implementation-notes artifact.
No browser acceptance, deployment or merge is claimed.
