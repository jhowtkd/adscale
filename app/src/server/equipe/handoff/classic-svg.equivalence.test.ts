// Ticket 19, phase 1, SVG: the Brand Kit takes SVG through its own sanitizer profile ("brand-training") and a drawing child that shares the raster slot.
// The ORACLE is `main` at 949471d2 (tests/fixtures/classic-raster-main/): what the upload did with `sharp` in the server. The decision of the owner (03/10): the PNG leaves at the
// declared size and in today's format; common filters, dashes, patterns and markers stay; an embedded image and an embedded font stay out. What is NOT the same as `main` is written
// down below as a difference on purpose, with the file that shows it. The reviewed handoff profile (logo, flow 0) must not move at all.
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { forgedPng } from "./logo-surface.fixtures";
import { ImageChildUnavailable } from "./svg-draw-child";
import * as transport from "./svg-draw-child";
import { RasterRetryError, isRasterRetry } from "./raster-image";
import { DRAW_MAX_RSS_MB, DRAW_WORKER_SOURCE, drawInChild } from "./svg-draw-child";
import { SvgLogoError, TRAINING_SVG_LIMITS, sanitizeSvg } from "./svg-sanitize";
import * as mainDraw from "../../../../tests/fixtures/classic-raster-main/svg-draw-child";
import * as mainSanitize from "../../../../tests/fixtures/classic-raster-main/svg-sanitize";
import * as mainUpload from "../../../../tests/fixtures/classic-raster-main/upload";
import { normalizeTrainingUpload } from "@/server/brand-training/upload";
import { normalizeImageForAi } from "@/server/ai/normalize-image-for-ai";
import * as mainNormalize from "../../../../tests/fixtures/classic-raster-main/normalize-image-for-ai";
import { measureImageBuffer } from "@/server/brand-training/measure-image";

vi.mock("./svg-draw-child", async importOriginal => {
  const actual = await importOriginal<typeof import("./svg-draw-child")>();
  return { ...actual, runImageChild: vi.fn(actual.runImageChild) };
});
const child = vi.mocked(transport.runImageChild);
const actualChild = (await vi.importActual<typeof import("./svg-draw-child")>("./svg-draw-child")).runImageChild;
afterEach(() => { vi.restoreAllMocks(); child.mockReset(); child.mockImplementation(actualChild); });

const wrap = (body: string, attrs = 'width="200" height="100" viewBox="0 0 200 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const svgFile = (svg: string, name = "x.svg") => new File([svg], name, { type: "image/svg+xml" });
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const filter = (attrs: string, inner: string, svgAttrs?: string, shape = '<rect width="100" height="50" fill="red" filter="url(#f)"/>') => wrap(`<defs><filter id="f" ${attrs}>${inner}</filter></defs>${shape}`, svgAttrs);
const blur = (n: number) => `<feGaussianBlur stdDeviation="${n}"/>`;
const offsets = (n: number) => Array.from({ length: n }, (_, i) => `<feOffset dx="1" dy="1" in="${i ? `r${i - 1}` : "SourceGraphic"}" result="r${i}"/>`).join("");
const points = (n: number) => Array.from({ length: n }, (_, i) => `${i % 200},${(i * 7) % 100}`).join(" ");
const polyline = (n: number, marker = false) => wrap(`${marker ? '<defs><marker id="m" markerWidth="4" markerHeight="4"><circle cx="2" cy="2" r="1"/></marker></defs>' : ""}<polyline fill="none" stroke="black" ${marker ? 'marker-mid="url(#m)"' : ""} points="${points(n)}"/>`);
const tiles = (side: number) => wrap(`<defs><pattern id="a" width="${side}" height="${side}" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="red"/></pattern></defs><rect width="200" height="100" fill="url(#a)"/>`);
const BIG = 'width="2048" height="2048" viewBox="0 0 2048 2048"';
const onBig = (inner: string) => wrap(`<defs><filter id="f">${inner}</filter></defs><rect x="100" y="100" width="1500" height="1500" fill="orange" filter="url(#f)"/>`, BIG);
const squareTiles = (side: number, content = '<rect width="0.5" height="0.5" fill="red"/>') => wrap(`<defs><pattern id="a" width="${side}" height="${side}" patternUnits="userSpaceOnUse">${content}</pattern></defs><rect width="2048" height="2048" fill="url(#a)"/>`, BIG);
const markerDefs = '<defs><marker id="m" markerWidth="4" markerHeight="4"><circle cx="2" cy="2" r="1"/></marker></defs>';
const ROOT = 'width="200" height="100" viewBox="0 0 200 100"';
const doc = (inner: string, attrs = ROOT, sheet = "") => wrap(`${sheet}${markerDefs}${inner}`, attrs);
const dense = (n: number, extra = "") => `<polyline fill="none" stroke="black" ${extra} points="${points(n)}"/>`;
const densePath = (n: number) => `<path fill="none" stroke="black" d="M0 0 ${Array.from({ length: n }, (_, i) => `L${i % 200} ${(i * 7) % 100}`).join(" ")}"/>`;
const MID = 'marker-mid="url(#m)"';
const shadowChain = (depth: number) => wrap(`<defs><filter id="f"><feDropShadow dx="4" dy="4" stdDeviation="4"/></filter></defs>${'<g filter="url(#f)">'.repeat(depth)}<rect width="100" height="50" fill="red"/>${"</g>".repeat(depth)}`);

/** What the owner decided stays: each one is drawn exactly as `main` drew it (same PNG bytes). */
const SAME_AS_MAIN: Record<string, string> = {
  "2x2": wrap('<rect width="2" height="2" fill="red"/>', 'width="2" height="2"'),
  "viewBox only": wrap('<circle cx="50" cy="50" r="40" fill="blue"/>', 'viewBox="0 0 100 100"'),
  "centimetres": wrap('<rect width="100%" height="100%" fill="green"/>', 'width="5cm" height="3cm"'),
  "inches with viewBox": wrap('<rect width="100%" height="100%" fill="green"/>', 'width="2in" height="1in" viewBox="0 0 10 5"'),
  "fractional size": wrap('<rect width="10" height="10" fill="red"/>', 'width="100.5" height="60.25" viewBox="0 0 20 12"'),
  "shadow: blur + offset + merge": wrap('<defs><filter id="f"><feGaussianBlur in="SourceAlpha" stdDeviation="4"/><feOffset dx="5" dy="5" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="20" y="20" width="80" height="40" fill="orange" filter="url(#f)"/>'),
  "feDropShadow": wrap('<defs><filter id="f"><feDropShadow dx="4" dy="4" stdDeviation="3"/></filter></defs><rect x="20" y="20" width="80" height="40" fill="orange" filter="url(#f)"/>'),
  "dashed stroke": wrap('<line x1="10" y1="50" x2="190" y2="50" stroke="black" stroke-width="4" stroke-dasharray="10 5"/>'),
  "pattern, userSpaceOnUse": wrap('<defs><pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="5" fill="red"/></pattern></defs><rect width="200" height="100" fill="url(#p)"/>'),
  "pattern, objectBoundingBox": wrap('<defs><pattern id="p" width="0.2" height="0.2" patternContentUnits="objectBoundingBox"><rect width="0.1" height="0.1" fill="red"/></pattern></defs><rect width="200" height="100" fill="url(#p)"/>'),
  "markers (start, mid, end)": wrap('<defs><marker id="m" markerWidth="6" markerHeight="6" refX="3" refY="3"><circle cx="3" cy="3" r="2" fill="red"/></marker></defs><path d="M10 10 L100 50 L190 10" stroke="black" fill="none" marker-start="url(#m)" marker-mid="url(#m)" marker-end="url(#m)"/>'),
  "transparent (semi-opaque circle)": wrap('<circle cx="100" cy="50" r="30" fill="blue" fill-opacity="0.5"/>'),
  "opaque background": wrap('<rect width="200" height="100" fill="red"/>'),
  "a webfont that cannot load": wrap('<style>@font-face{font-family:x;src:url(http://127.0.0.1:1/x.woff)}</style><text x="10" y="50" font-family="x">Hi</text>'),
  "2048 x 2048 (the ceiling)": wrap('<rect width="10" height="10" fill="red"/>', 'width="2048" height="2048"'),
  // The approved policy (2048 x 2048 at 384 MiB in the one slot): the common illustrations of the Brand Kit are still `main`'s picture.
  "shadow on 2048 x 2048: blur 8 + offset + merge": onBig('<feGaussianBlur in="SourceAlpha" stdDeviation="8"/><feOffset dx="12" dy="12" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>'),
  "feDropShadow on 2048 x 2048": onBig('<feDropShadow dx="12" dy="12" stdDeviation="8"/>'),
  "blur of 32 on 2048 x 2048": onBig(blur(32)),
  "two shadowed shapes on 2048 x 2048": wrap('<defs><filter id="f"><feDropShadow dx="12" dy="12" stdDeviation="8"/></filter></defs><rect x="100" y="100" width="1500" height="1500" fill="orange" filter="url(#f)"/><rect x="50" y="50" width="900" height="900" fill="blue" filter="url(#f)"/>', BIG),
  "a blur on a primitive in objectBoundingBox units, small": wrap('<defs><filter id="f" primitiveUnits="objectBoundingBox"><feGaussianBlur stdDeviation="0.05"/></filter></defs><rect width="100" height="50" fill="red" filter="url(#f)"/>'),
  "4194304 one-pixel pattern tiles on 2048 x 2048": squareTiles(1),
  "the same tiles with a bigger tile (1 px on a 400 px piece)": wrap('<defs><pattern id="a" width="0.5" height="0.5" patternUnits="userSpaceOnUse"><rect width="0.25" height="0.25" fill="red"/></pattern></defs><rect width="400" height="400" fill="url(#a)"/>', 'width="400" height="400" viewBox="0 0 400 400"'),
  "three pattern fills of 2 px tiles on 2048 x 2048": wrap('<defs><pattern id="a" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="red"/></pattern></defs><rect width="2048" height="700" fill="url(#a)"/><rect y="700" width="2048" height="700" fill="url(#a)"/><rect y="1400" width="2048" height="648" fill="url(#a)"/>', BIG),
  "512 marker vertices (1024 coordinates)": polyline(512, true),
  "an unused marker and a dense path (3000 vertices)": wrap(`${markerDefs}<path fill="none" stroke="black" d="M0 0 ${Array.from({ length: 3000 }, (_, i) => `L${i % 200} ${(i * 7) % 100}`).join(" ")}"/>`),
  "an unused marker and a dense polyline (5000 vertices)": wrap(`${markerDefs}<polyline fill="none" stroke="black" points="${points(5000)}"/>`),
  "a marker on a short polyline and a dense polyline without it": wrap(`${markerDefs}<polyline fill="none" stroke="black" marker-mid="url(#m)" points="${points(500)}"/><polyline fill="none" stroke="black" points="${points(3000)}"/>`),
  // A marker that reaches a shape by inheritance counts like one declared on it (same limit), and "none" takes it away: what stays under the limit is `main`'s picture.
  "inherited marker, none on the shape (attribute)": doc(`<g ${MID}>${dense(1500, 'marker-mid="none"')}</g>`),
  "inherited marker, none on the shape (style)": doc(`<g ${MID}>${dense(1500, 'style="marker-mid:none"')}</g>`),
  "marker on the root, none on the shape": doc(dense(1500, 'marker-mid="none"'), `${ROOT} ${MID}`),
  "a <use> of a dense shape that says none, under a group with the marker": doc(`<defs>${dense(1500, 'id="d" marker-mid="none"')}</defs><g ${MID}><use href="#d"/></g>`),
  "inherited marker on 400 vertices": doc(`<g ${MID}>${dense(400)}</g>`),
  "inherited marker on 512 vertices": doc(`<g ${MID}>${dense(512)}</g>`),
  "three <use> of a 300-vertex marked shape": doc(`<defs>${dense(300, `id="d" ${MID}`)}</defs><use href="#d"/><use href="#d" x="1"/><use href="#d" x="2"/>`),
  "three <use> of a 300-vertex shape under a marker group": doc(`<defs>${dense(300, 'id="d"')}</defs><g ${MID}><use href="#d"/><use href="#d" x="1"/><use href="#d" x="2"/></g>`),
  "two 300-vertex polylines under one marker group": doc(`<g ${MID}>${dense(300)}${dense(300)}</g>`),
  "marker-mid none on a group with a dense polyline": doc(`<g marker-mid="none">${dense(3000)}</g>`),
  "a marker reference to nothing, dense polyline": wrap(`<g marker-mid="url(#nope)">${dense(3000)}</g>`),
  "a marker-start group of 300 and a dense polyline outside it": doc(`<g marker-start="url(#m)">${dense(300)}</g>${dense(3000)}`),
  // The shorthand `marker:` (style, class, root) is expanded to start/mid/end: under the limit it is `main`'s picture, and "none" takes it away.
  "shorthand marker in a style, 300 vertices": doc(dense(300, 'style="marker:url(#m)"')),
  "shorthand marker in a style, 512 vertices": doc(dense(512, 'style="marker:url(#m)"')),
  "shorthand marker inherited from a <g> style, 300 vertices": doc(`<g style="marker:url(#m)">${dense(300)}</g>`),
  "shorthand marker from a CSS class, 300 vertices": doc(dense(300, 'class="k"'), ROOT, "<style>.k{marker:url(#m)}</style>"),
  "shorthand marker in a style, none on the shape's shorthand": doc(`<g style="marker:url(#m)">${dense(1500, 'style="marker:none"')}</g>`),
  "shorthand marker on a group, all three longhands none on the dense shape": doc(`<g style="marker:url(#m)">${dense(1500, 'marker-start="none" marker-mid="none" marker-end="none"')}</g>`),
  "shorthand none on a dense shape": doc(dense(1500, 'style="marker:none"')),
  "shorthand to a marker that does not exist, dense": wrap(`<g style="marker:url(#nope)">${dense(3000)}</g>`),
  "shorthand marker on a path of three vertices (the markers are drawn)": doc('<path d="M10 10 L100 50 L190 10" stroke="black" fill="none" style="marker:url(#m)"/>'),
  // Right at each limit of the proposal, and long chains that stay inside them: still `main`'s picture.
  "24 filter primitives": filter("", offsets(24)),
  "blur of 32": filter("", blur(32)),
  "filter region at 2x": filter('x="-0.5" y="-0.5" width="2" height="2"', blur(3)),
  "24 primitives, each a blur of 30": filter("", Array.from({ length: 24 }, () => blur(30)).join("")),
  "four blurs of 32 in one filter": filter("", blur(32).repeat(4)),
  "500 marker vertices": polyline(500, true),
  "2000 vertices of a plain polyline": polyline(2000),
  "20000 vertices of a plain path": wrap(`<path fill="none" stroke="black" d="M0 0 ${Array.from({ length: 20_000 }, (_, i) => `L${i % 200} ${(i * 7) % 100}`).join(" ")}"/>`),
  "4096 pattern tiles": tiles(3.125),
  "more than 4096 pattern tiles that main also drew": tiles(2.8),
  "a shadow chain 1 deep": shadowChain(1),
  "a shadow chain 8 deep": shadowChain(8),
  "a shadow chain 20 deep": shadowChain(20),
};
/** What the sanitizer refuses (`svg_too_complex`) before any process starts. `main` handed every one of them to the renderer in the server. */
const REFUSED: Record<string, string> = {
  "25 filter primitives": filter("", offsets(25)),
  "200 filter primitives": filter("", offsets(200)),
  "blur of 33": filter("", blur(33)),
  "blur of 100000": filter("", blur(100_000)),
  "blur of 7 that renders as 35 px (the scale counts)": filter("", blur(7), 'width="1000" height="500" viewBox="0 0 200 100"'),
  "blur of 32 that renders much larger": filter("", blur(32), 'width="2048" height="1024" viewBox="0 0 200 100"'),
  "filter region at 2.5x": filter('x="-0.75" y="-0.75" width="2.5" height="2.5"', blur(3)),
  "filter region at 3x": filter('x="-1" y="-1" width="3" height="3"', blur(3)),
  "filter region at 5x": filter('x="-2" y="-2" width="5" height="5"', blur(3)),
  "filter region in user units, far larger": filter('filterUnits="userSpaceOnUse" x="-200" y="-100" width="600" height="300"', blur(3)),
  "patterns that point at each other": wrap('<defs><pattern id="a" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#b)"/></pattern><pattern id="b" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="url(#a)"/></pattern></defs><rect width="200" height="100" fill="url(#a)"/>'),
  "a pattern that points at itself": wrap('<defs><pattern id="a" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#a)"/></pattern></defs><rect width="200" height="100" fill="url(#a)"/>'),
  "a pattern tile of 0.001": wrap('<defs><pattern id="a" width="0.001" height="0.001" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="red"/></pattern></defs><rect width="200" height="100" fill="url(#a)"/>'),
  "a pattern transform of scale(0.0001)": wrap('<defs><pattern id="a" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="scale(0.0001)"><rect width="5" height="5" fill="red"/></pattern></defs><rect width="200" height="100" fill="url(#a)"/>'),
  "513 marker vertices (1026 coordinates)": polyline(513, true),
  "a marker reached through CSS on a dense polyline": wrap(`<style>.d{marker-mid:url(#m)}</style>${markerDefs}<polyline class="d" fill="none" stroke="black" points="${points(1500)}"/>`),
  "pattern tiles past 4194304 (a tile of 0.9999)": squareTiles(0.9999),
  "16 million pattern tiles": squareTiles(0.5),
  "4194304 tiles whose tile draws 50 shapes (the cost is counted in blocks of 4096)": squareTiles(1, '<rect width="0.5" height="0.5" fill="red"/>'.repeat(50)),
  "a blur of 0.5 in objectBoundingBox primitive units (renders far past 32 px)": wrap('<defs><filter id="f" primitiveUnits="objectBoundingBox"><feGaussianBlur stdDeviation="0.5"/></filter></defs><rect width="100" height="50" fill="red" filter="url(#f)"/>'),
  "a primitive region that is 9x the shape": wrap('<defs><filter id="f"><feOffset dx="1" x="-300" y="-300" width="900" height="900"/></filter></defs><rect width="100" height="50" fill="red" filter="url(#f)"/>'),
  "marker-mid inherited from a <g> (attribute), dense polyline": doc(`<g ${MID}>${dense(1500)}</g>`),
  "marker-mid inherited from a <g>, dense path": doc(`<g ${MID}>${densePath(1500)}</g>`),
  "marker-mid inherited through three nested groups": doc(`<g ${MID}><g><g>${dense(1500)}</g></g></g>`),
  "marker-mid inherited from the root <svg>": doc(dense(1500), `${ROOT} ${MID}`),
  "marker-mid inherited from a <g> style": doc(`<g style="marker-mid:url(#m)">${dense(1500)}</g>`),
  "marker-mid from a CSS class on the <g>": doc(`<g class="k">${dense(1500)}</g>`, ROOT, "<style>.k{marker-mid:url(#m)}</style>"),
  "marker-mid from a CSS rule on g": doc(`<g>${dense(1500)}</g>`, ROOT, "<style>g{marker-mid:url(#m)}</style>"),
  "marker-mid from a CSS rule on svg": doc(dense(1500), ROOT, "<style>svg{marker-mid:url(#m)}</style>"),
  "marker-mid from a CSS rule on polyline": doc(dense(1500), ROOT, "<style>polyline{marker-mid:url(#m)}</style>"),
  "marker-start inherited from a <g>, dense polyline": doc(`<g marker-start="url(#m)">${dense(1500)}</g>`),
  "marker-end inherited from a <g>, dense polyline": doc(`<g marker-end="url(#m)">${dense(1500)}</g>`),
  "inherited marker on 513 vertices": doc(`<g ${MID}>${dense(513)}</g>`),
  "a <use> of a dense shape with a marker": doc(`<defs>${dense(1500, `id="d" ${MID}`)}</defs><use href="#d"/>`),
  "a <use> that carries the marker to a dense shape": doc(`<defs>${dense(1500, 'id="d"')}</defs><use href="#d" ${MID}/>`),
  "a <use> inside a marker group, dense shape": doc(`<defs>${dense(1500, 'id="d"')}</defs><g ${MID}><use href="#d"/></g>`),
  "a <use> of a group that carries the marker": doc(`<defs><g id="d" ${MID}>${dense(1500)}</g></defs><use href="#d"/>`),
  "a <use> of a symbol with a dense marked shape": doc(`<symbol id="s" viewBox="0 0 200 100">${dense(1500, MID)}</symbol><use href="#s"/>`),
  "twenty <use> of a 100-vertex marked shape (the instances add up)": doc(`<defs>${dense(100, `id="d" ${MID}`)}</defs>${Array.from({ length: 20 }, (_, i) => `<use href="#d" x="${i}"/>`).join("")}`),
  "shorthand marker in a style, 513 vertices": doc(dense(513, 'style="marker:url(#m)"')),
  "shorthand marker in a style, dense shape": doc(dense(1500, 'style="marker:url(#m)"')),
  "shorthand marker inherited from a <g> style, dense": doc(`<g style="marker:url(#m)">${dense(1500)}</g>`),
  "shorthand marker from a CSS class on the shape, dense": doc(dense(1500, 'class="k"'), ROOT, "<style>.k{marker:url(#m)}</style>"),
  "shorthand marker from a CSS class on the <g>, dense": doc(`<g class="k">${dense(1500)}</g>`, ROOT, "<style>.k{marker:url(#m)}</style>"),
  "shorthand marker on the root style, dense": doc(dense(1500), `${ROOT} style="marker:url(#m)"`),
  "shorthand on a group, only marker-mid none on the shape (start and end still inherit)": doc(`<g style="marker:url(#m)">${dense(1500, 'marker-mid="none"')}</g>`),
  "shorthand on a group, only start and end none on the shape (mid still inherits)": doc(`<g style="marker:url(#m)">${dense(1500, 'marker-start="none" marker-end="none"')}</g>`),
  "a <use> of a dense shape with the shorthand": doc(`<defs>${dense(1500, 'id="d" style="marker:url(#m)"')}</defs><use href="#d"/>`),
  "a <use> that carries the shorthand to a dense shape": doc(`<defs>${dense(1500, 'id="d"')}</defs><use href="#d" style="marker:url(#m)"/>`),
  "twenty <use> of a 100-vertex shape with the shorthand": doc(`<defs>${dense(100, 'id="d" style="marker:url(#m)"')}</defs>${Array.from({ length: 20 }, (_, i) => `<use href="#d" x="${i}"/>`).join("")}`),
  "three <use> of a 300-vertex shape with the shorthand (counted as start+mid+end: the longhand mid alone is accepted)": doc(`<defs>${dense(300, 'id="d" style="marker:url(#m)"')}</defs><use href="#d"/><use href="#d" x="1"/><use href="#d" x="2"/>`),
  "two 300-vertex polylines under a shorthand group (counted as start+mid+end: the longhand mid alone is accepted)": doc(`<g style="marker:url(#m)">${dense(300)}${dense(300)}</g>`),
  "1000 marker vertices": polyline(1000, true),
  "3000 marker vertices": polyline(3000, true),
};
/** Pixels of every PNG, whatever the encoder wrote: both sides decoded to RGBA. */
const pixels = (png: Buffer) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => ({ data, width: info.width, height: info.height }));
const reasonOf = (error: unknown) => ((error as Error | undefined)?.cause as SvgLogoError | undefined)?.code;
const settle = <T>(run: () => Promise<T>) => run().then(value => ({ value }), (error: unknown) => ({ error }));

describe("SVG upload against `main`: the PNG is the same file", () => {
  it.each(Object.entries(SAME_AS_MAIN))("%s: the same PNG bytes, type, extension and alpha flag", async (_name, svg) => {
    const expected = await mainUpload.normalizeTrainingUpload(svgFile(svg));
    const actual = await normalizeTrainingUpload(svgFile(svg));
    expect(actual.type).toBe(expected.type);
    expect(actual.extension).toBe(expected.extension);
    expect(actual.hasAlpha).toBe(expected.hasAlpha);
    expect(Buffer.compare(actual.buffer, expected.buffer)).toBe(0);
  }, 60_000);
  it("the pixels are identical too, RGBA by RGBA, for the transparent and the shadowed pieces (the check that survives an encoder change)", async () => {
    for (const name of ["transparent (semi-opaque circle)", "shadow: blur + offset + merge", "feDropShadow", "markers (start, mid, end)", "pattern, objectBoundingBox"]) {
      const expected = await pixels((await mainUpload.normalizeTrainingUpload(svgFile(SAME_AS_MAIN[name]!))).buffer);
      const actual = await pixels((await normalizeTrainingUpload(svgFile(SAME_AS_MAIN[name]!))).buffer);
      expect(actual.width, name).toBe(expected.width);
      expect(actual.height, name).toBe(expected.height);
      expect(Buffer.compare(actual.data, expected.data), name).toBe(0);
    }
  }, 60_000);
});

describe("SVG upload: what the owner left out, or bounded, differs from `main` on purpose", () => {
  it("an embedded raster image stays out: the PNG is `main`'s drawing of the same piece without the <image>, and it is not `main`'s drawing of the piece with it", async () => {
    const withImage = wrap(`<rect width="200" height="100" fill="white"/><image href="${PIXEL}" width="50" height="50"/>`);
    const without = wrap('<rect width="200" height="100" fill="white"/>');
    const main = await mainUpload.normalizeTrainingUpload(svgFile(withImage)), mainWithout = await mainUpload.normalizeTrainingUpload(svgFile(without));
    const actual = await normalizeTrainingUpload(svgFile(withImage));
    expect(Buffer.compare(actual.buffer, main.buffer)).not.toBe(0);
    expect(Buffer.compare(actual.buffer, mainWithout.buffer)).toBe(0);
  });
  it("an embedded image used by a filter (feImage) stays out: it is not drawn, and the piece is still accepted", async () => {
    const svg = filter("", `<feImage href="${PIXEL}"/>`);
    const main = await mainUpload.normalizeTrainingUpload(svgFile(svg));
    const actual = await normalizeTrainingUpload(svgFile(svg));
    expect(actual.type).toBe("image/png");
    expect(Buffer.compare(actual.buffer, main.buffer)).not.toBe(0);
  });
  it("an embedded font (@font-face with a data: font) stays out, and the text is drawn with what the system has, as `main` drew it", async () => {
    const svg = wrap('<style>@font-face{font-family:x;src:url(data:font/woff2;base64,d09GMgABAAAAAAAA)}</style><text x="10" y="50" font-family="x" font-size="20">Hi</text>');
    const expected = await mainUpload.normalizeTrainingUpload(svgFile(svg));
    expect(Buffer.compare((await normalizeTrainingUpload(svgFile(svg))).buffer, expected.buffer)).toBe(0);
  });
  it("a side past 2048 leaves at 2048 (scaled, same ratio) where `main` drew 2049 and 5000, and a piece of 4 MP or less is never scaled", async () => {
    const at = async (width: number, height: number) => {
      const png = (await normalizeTrainingUpload(svgFile(wrap('<rect width="10" height="10" fill="red"/>', `width="${width}" height="${height}"`)))).buffer;
      const meta = await sharp(png).metadata();
      return [meta.width, meta.height];
    };
    expect(await at(2049, 100)).toEqual([2048, 100]);
    expect(await at(5000, 5000)).toEqual([2048, 2048]);
    expect(await at(2048, 2048)).toEqual([2048, 2048]);
    expect(await at(1000, 500)).toEqual([1000, 500]);
    const main = await mainUpload.normalizeTrainingUpload(svgFile(wrap('<rect width="10" height="10" fill="red"/>', 'width="5000" height="5000"')));
    expect((await sharp(main.buffer).metadata()).width).toBe(5000);
  }, 60_000);
  it("nothing outside the file is read: an <image>, an feImage, a CSS @import and a font that point at a server of ours make no request", async () => {
    let requests = 0;
    const server: Server = createServer((_request, response) => { requests++; response.end(); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/x.png`;
    try {
      for (const svg of [
        wrap(`<image href="${url}" width="50" height="50"/><rect width="10" height="10"/>`),
        filter("", `<feImage href="${url}"/>`),
        wrap(`<style>@import url(${url}); @font-face{font-family:x;src:url(${url})}</style><text x="5" y="50" font-family="x">Hi</text>`),
        wrap(`<defs><pattern id="a" width="10" height="10" patternUnits="userSpaceOnUse"><image href="${url}" width="10" height="10"/></pattern></defs><rect width="100" height="50" fill="url(#a)"/>`),
      ]) await settle(() => normalizeTrainingUpload(svgFile(svg)));
    } finally { await new Promise(resolve => server.close(resolve)); }
    expect(requests).toBe(0);
  }, 60_000);
});

describe("hostile SVGs: refused at the sanitizer with no process, or drawn exactly as `main` did, inside the limits", () => {
  it.each(Object.entries(REFUSED))("%s is refused as svg_too_complex and never reaches a child", async (_name, svg) => {
    child.mockClear();
    const result = await settle(() => normalizeTrainingUpload(svgFile(svg)));
    expect((result.error as Error).message).toBe("invalid_type");
    expect(reasonOf(result.error)).toBe("svg_too_complex");
    expect(child).not.toHaveBeenCalled();
  });
  it("the sanitizer says the same thing alone (a code, never the file's content), for each refused piece", () => {
    for (const svg of Object.values(REFUSED)) {
      expect(() => sanitizeSvg(Buffer.from(svg), { profile: "brand-training" })).toThrowError(expect.objectContaining({ code: "svg_too_complex" }) as unknown as Error);
    }
  });
  it("a hostile corpus in a clean process: every outcome is a refusal or a bounded PNG (2048 on a side), the server takes at most 48 MB more, and sharp is not in it (no time is asserted: the deadline is the child's)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "classic-svg-"));
    try {
      const list = path.join(dir, "list.json"), driver = path.join(dir, "driver.mjs");
      writeFileSync(list, JSON.stringify([...Object.values(REFUSED), ...Object.entries(SAME_AS_MAIN).filter(([name]) => /filter|blur|region|vertices|tiles|shadow chain/.test(name)).map(([, svg]) => svg)]));
      writeFileSync(driver, `
        import { readFileSync } from "node:fs";
        const svgs = JSON.parse(readFileSync(process.argv[2], "utf8"));
        const { normalizeTrainingUpload } = await import("@/server/brand-training/upload");
        const before = process.resourceUsage().maxRSS;
        const outcomes = [];
        for (const svg of svgs) {
          outcomes.push(await normalizeTrainingUpload(new File([svg], "x.svg", { type: "image/svg+xml" })).then(
            r => ({ ok: true, width: Number(r.buffer.readUInt32BE(16)), height: Number(r.buffer.readUInt32BE(20)), bytes: r.buffer.length }),
            e => ({ ok: false, message: e.message, reason: e.cause?.code ?? null })));
        }
        const shared = process.report.getReport().sharedObjects.filter(file => /sharp|vips/i.test(file));
        console.log(JSON.stringify({ growthMB: Math.round((process.resourceUsage().maxRSS - before) / 1024), outcomes, shared }));
      `);
      const run = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", driver, list], { cwd: process.cwd(), encoding: "utf8", timeout: 240_000, maxBuffer: 64 * 1024 * 1024 });
      if (run.status !== 0) throw new Error(`driver failed (${run.status}): ${run.stderr.slice(-2000)}`);
      const result = JSON.parse(run.stdout.trim().split("\n").pop()!) as { growthMB: number; outcomes: Array<{ ok: boolean; width?: number; height?: number; message?: string; reason?: string | null }>; shared: string[] };
      expect(result.shared).toEqual([]);
      expect(result.growthMB).toBeLessThanOrEqual(48);
      const refused = Object.keys(REFUSED).length;
      result.outcomes.slice(0, refused).forEach(outcome => expect(outcome).toEqual({ ok: false, message: "invalid_type", reason: "svg_too_complex" }));
      for (const outcome of result.outcomes.slice(refused)) { expect(outcome.ok).toBe(true); expect(Math.max(outcome.width!, outcome.height!)).toBeLessThanOrEqual(2048); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 300_000);
});

describe("the SVG shares the one raster slot, and recovers", () => {
  it("SVG and raster uploads, measure and AI normalization at once never run two children, and every caller is answered", async () => {
    let live = 0, peak = 0;
    child.mockImplementation(async (...args) => { live++; peak = Math.max(peak, live); try { return await actualChild(...args); } finally { live--; } });
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#336699" } }).png().toBuffer();
    const svg = SAME_AS_MAIN["dashed stroke"]!;
    const calls = [
      () => normalizeTrainingUpload(svgFile(svg), "classic:a"),
      () => normalizeTrainingUpload(svgFile(SAME_AS_MAIN["feDropShadow"]!), "classic:b"),
      () => normalizeTrainingUpload(new File([new Uint8Array(png)], "p.png", { type: "image/png" }), "classic:a"),
      () => measureImageBuffer(png, { accountKey: "classic:c" }),
      () => normalizeImageForAi({ buffer: png, accountKey: "classic:c" }),
    ];
    const results = await Promise.all([...calls, ...calls].map(call => settle(call)));
    expect(results.filter(r => r.error)).toEqual([]);
    expect(child).toHaveBeenCalledTimes(10);
    expect(peak).toBe(1);
  }, 120_000);
  it("a drawing child that is unavailable is a retry for the SVG as it is for the raster (never 'this file is not an image'), and the line is free afterwards", async () => {
    child.mockImplementation(async () => { throw new ImageChildUnavailable("spawn failed"); });
    const result = await settle(() => normalizeTrainingUpload(svgFile(SAME_AS_MAIN["dashed stroke"]!)));
    expect(isRasterRetry(result.error)).toBe(true);
    expect(result.error).toBeInstanceOf(RasterRetryError);
    child.mockImplementation(actualChild);
    expect((await normalizeTrainingUpload(svgFile(SAME_AS_MAIN["dashed stroke"]!))).type).toBe("image/png");
  });
  it("what the real transport does when the child cannot even start (the program is not there) is a retry too, not invalid_type, for the SVG and for the raster alike", async () => {
    const execPath = process.execPath;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#336699" } }).png().toBuffer();
    Object.defineProperty(process, "execPath", { value: "/nonexistent/node", configurable: true });
    try {
      const svg = await settle(() => normalizeTrainingUpload(svgFile(SAME_AS_MAIN["dashed stroke"]!)));
      const raster = await settle(() => normalizeImageForAi({ buffer: png }));
      expect(isRasterRetry(raster.error), `raster got ${(raster.error as Error | undefined)?.message}`).toBe(true);
      expect(isRasterRetry(svg.error), `svg got ${(svg.error as Error | undefined)?.message}`).toBe(true);
    } finally { Object.defineProperty(process, "execPath", { value: execPath, configurable: true }); }
  });
  it("an SVG that is not an SVG (a script, bytes, a PNG declared as SVG) is invalid_type and the next piece is drawn", async () => {
    for (const bytes of ["<html><script>alert(1)</script></html>", "not xml at all", "<svg xmlns='http://www.w3.org/2000/svg'"]) {
      const result = await settle(() => normalizeTrainingUpload(svgFile(bytes)));
      expect((result.error as Error).message).toBe("invalid_type");
      expect(isRasterRetry(result.error)).toBe(false);
    }
    expect((await normalizeTrainingUpload(svgFile(SAME_AS_MAIN["opaque background"]!))).extension).toBe("png");
  });
});

describe("the approved policy: expensive primitives are out, and the one slot has 384 MiB", () => {
  const EXPENSIVE: Record<string, string> = {
    feTurbulence: '<feTurbulence baseFrequency="0.05" numOctaves="3"/>',
    feConvolveMatrix: '<feConvolveMatrix order="3" kernelMatrix="1 1 1 1 1 1 1 1 1"/>',
    "feDisplacementMap (with a turbulence)": '<feTurbulence baseFrequency="0.05" result="r"/><feDisplacementMap in="SourceGraphic" in2="r" scale="20"/>',
    feMorphology: '<feMorphology operator="dilate" radius="5"/>',
    feDiffuseLighting: '<feDiffuseLighting><feDistantLight azimuth="45" elevation="60"/></feDiffuseLighting>',
  };
  it.each(Object.entries(EXPENSIVE))("%s is taken out of the file: no refusal, no process work beyond the drawing, and the PNG is `main`'s drawing of the piece without what the filter drew", async (_name, primitive) => {
    const svg = filter("", primitive);
    const main = await mainUpload.normalizeTrainingUpload(svgFile(svg));
    const actual = await normalizeTrainingUpload(svgFile(svg));
    expect(actual.type).toBe("image/png");
    expect(Buffer.compare(actual.buffer, main.buffer)).not.toBe(0);
    // Nothing of the shape is left: the same PNG as an empty drawing of the same size.
    const empty = await mainUpload.normalizeTrainingUpload(svgFile(wrap("")));
    expect(Buffer.compare(actual.buffer, empty.buffer)).toBe(0);
  });
  it("the SVG is drawn in the raster slot, with the 384 MiB ceiling and a 17 MiB output, and the logo's own drawing keeps its 160", async () => {
    child.mockClear();
    await normalizeTrainingUpload(svgFile(SAME_AS_MAIN["dashed stroke"]!));
    expect(child).toHaveBeenCalledTimes(1);
    expect(child.mock.calls[0]![1]).toMatchObject({ maxRssMb: 384, maxOutputBytes: 17 * 1024 * 1024 });
    expect(mainDraw.DRAW_MAX_RSS_MB).toBe(160);
    expect(DRAW_MAX_RSS_MB).toBe(160);
  });
  it("a 2048 x 2048 shadow is drawn in the shared slot together with raster work: still one child at a time", async () => {
    let live = 0, peak = 0;
    child.mockImplementation(async (...args) => { live++; peak = Math.max(peak, live); try { return await actualChild(...args); } finally { live--; } });
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#336699" } }).png().toBuffer();
    const results = await Promise.all([
      settle(() => normalizeTrainingUpload(svgFile(SAME_AS_MAIN["shadow on 2048 x 2048: blur 8 + offset + merge"]!), "classic:a")),
      settle(() => measureImageBuffer(png, { accountKey: "classic:b" })),
      settle(() => normalizeTrainingUpload(svgFile(SAME_AS_MAIN["feDropShadow on 2048 x 2048"]!), "classic:c")),
      settle(() => normalizeImageForAi({ buffer: png, accountKey: "classic:b" })),
    ]);
    expect(results.filter(r => r.error)).toEqual([]);
    expect(peak).toBe(1);
  }, 120_000);
});

describe("PR 621 review: ids defined twice must not make the classic sanitizer's work grow with the branching (CPU in the server process)", () => {
  /** Every id is defined twice: the first one is empty, the second one holds `branch` <use> of the next id (the renderer takes the first; the sanitizer used to follow both). */
  const duplicated = (branch: number, levels: number) => {
    const defs: string[] = [];
    for (let level = 0; level <= levels; level++) {
      defs.push(`<g id="a${level}"/>`);
      defs.push(`<g id="a${level}">${level < levels ? Array.from({ length: branch }, () => `<use href="#a${level + 1}"/>`).join("") : '<rect width="5" height="5"/>'}</g>`);
    }
    return Buffer.from(wrap(`<defs>${defs.join("")}</defs><use href="#a0"/>`));
  };
  const outcome = (bytes: Buffer, options?: { profile?: "brand-training" }) => { try { sanitizeSvg(bytes, options); return { code: "ok" as string, visits: undefined as number | undefined }; } catch (error) { return { code: (error as SvgLogoError).code as string, visits: (error as { markerVisits?: number }).markerVisits }; } };
  const SHAPES: Array<[number, number]> = [[4, 6], [4, 8], [4, 11], [4, 20], [2, 11], [8, 11], [2, 40]];
  it.each(SHAPES)("branching %i, %i levels: refused as svg_too_complex, with a work count under the global budget", (branch, levels) => {
    const result = outcome(duplicated(branch, levels), { profile: "brand-training" });
    expect(result.code).toBe("svg_too_complex");
    expect(result.visits).toBeGreaterThan(0);
    expect(result.visits).toBeLessThanOrEqual(TRAINING_SVG_LIMITS.maxMarkerVisits);
  });
  it("the work is linear in the levels, not exponential: doubling the levels less than triples the count, and the count at 40 levels is a few hundred, not millions", () => {
    const visits = (levels: number) => outcome(duplicated(4, levels), { profile: "brand-training" }).visits!;
    expect(visits(20)).toBeLessThan(visits(11) * 3);
    expect(visits(40)).toBeLessThan(visits(20) * 3);
    expect(visits(40)).toBeLessThan(2_000);
  });
  it("the same count for a larger branching grows by the branching, not by its power (8 vs 4 at 11 levels is less than 4x)", () => {
    expect(outcome(duplicated(8, 11), { profile: "brand-training" }).visits!).toBeLessThan(outcome(duplicated(4, 11), { profile: "brand-training" }).visits! * 4);
  });
  it("small documents of the same shape are still accepted (the refusal is the cost, not the shape): 4-way, up to 5 levels", () => {
    for (let levels = 1; levels <= 5; levels++) expect(outcome(duplicated(4, levels), { profile: "brand-training" }).code, `levels ${levels}`).toBe("ok");
  });
  it("the budget is the sum of the two document limits and it is an internal count: it is on the error object, never in its message or its code", () => {
    expect(TRAINING_SVG_LIMITS.maxMarkerVisits).toBe(10_000 + 20_000);
    const error = (() => { try { sanitizeSvg(duplicated(4, 11), { profile: "brand-training" }); } catch (caught) { return caught as SvgLogoError; } })()!;
    expect(error.message).toBe("svg_too_complex");
    expect(Object.keys(error)).toEqual(expect.arrayContaining(["code", "markerVisits"]));
    expect(JSON.stringify({ message: error.message, code: error.code })).not.toMatch(/\d{2,}/);
  });
  it("through the upload it is the usual invalid_type, and no process starts", async () => {
    child.mockClear();
    const result = await settle(() => normalizeTrainingUpload(svgFile(duplicated(4, 11).toString())));
    expect((result.error as Error).message).toBe("invalid_type");
    expect(reasonOf(result.error)).toBe("svg_too_complex");
    expect(child).not.toHaveBeenCalled();
  });
  it("the reviewed handoff profile is the oracle's: the same document or the same refusal for every one of these (and no profile is no extra work)", () => {
    for (const [branch, levels] of SHAPES) {
      const bytes = duplicated(branch, levels);
      const expected = (() => { try { return { value: mainSanitize.sanitizeSvg(bytes) }; } catch (error) { return { code: (error as SvgLogoError).code }; } })();
      const actual = (() => { try { return { value: sanitizeSvg(bytes) }; } catch (error) { return { code: (error as SvgLogoError).code }; } })();
      expect(actual, `${branch}x${levels}`).toEqual(expected);
    }
  });
  it("a big but ordinary document (9000 shapes in groups) is accepted and the budget does not refuse it: the count is by visits, never by the clock", () => {
    const rects = Array.from({ length: 9000 }, (_, i) => `<rect x="${i % 190}" y="${i % 90}" width="2" height="2" fill="#${(i % 4096).toString(16).padStart(3, "0")}"/>`).join("");
    expect(outcome(Buffer.from(wrap(`<g>${rects}</g>`)), { profile: "brand-training" }).code).toBe("ok");
  });
});

describe("ids defined twice: the renderer draws the FIRST definition, in the real child and in `main`'s renderer (the sanitizer's accounting follows the same rule)", () => {
  type DuplicateCase = { name: string; A: string; B: string; use: string };
  const DUPLICATE_ID_CASES: DuplicateCase[] = [
  { name: "use of rect/circle", A: '<rect id="x" width="40" height="40" fill="red"/>', B: '<circle id="x" cx="60" cy="40" r="30" fill="blue"/>', use: '<use href="#x"/>' },
  { name: "use of g/g", A: '<g id="x"><rect width="30" height="30" fill="red"/></g>', B: '<g id="x"><rect x="50" y="10" width="60" height="60" fill="blue"/></g>', use: '<use href="#x"/>' },
  { name: "marker-mid", A: '<marker id="m" markerWidth="6" markerHeight="6" refX="3" refY="3"><circle cx="3" cy="3" r="2" fill="red"/></marker>', B: '<marker id="m" markerWidth="20" markerHeight="20" refX="10" refY="10"><rect width="20" height="20" fill="blue"/></marker>', use: '<path d="M10 10 L60 40 L110 10" stroke="black" fill="none" marker-start="url(#m)" marker-mid="url(#m)" marker-end="url(#m)"/>' },
  { name: "fill gradient", A: '<linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="red"/></linearGradient>', B: '<linearGradient id="g"><stop offset="0" stop-color="blue"/><stop offset="1" stop-color="blue"/></linearGradient>', use: '<rect width="120" height="80" fill="url(#g)"/>' },
  { name: "fill gradient (radial vs linear)", A: '<linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="yellow"/></linearGradient>', B: '<radialGradient id="g"><stop offset="0" stop-color="blue"/><stop offset="1" stop-color="green"/></radialGradient>', use: '<rect width="120" height="80" fill="url(#g)"/>' },
  { name: "filter", A: '<filter id="f"><feOffset dx="1" dy="1"/></filter>', B: '<filter id="f"><feGaussianBlur stdDeviation="12"/></filter>', use: '<rect x="30" y="20" width="60" height="40" fill="orange" filter="url(#f)"/>' },
  { name: "filter (merge shadow second)", A: '<filter id="f"><feFlood flood-color="red"/></filter>', B: '<filter id="f"><feDropShadow dx="8" dy="8" stdDeviation="4"/></filter>', use: '<rect x="30" y="20" width="60" height="40" fill="orange" filter="url(#f)"/>' },
  { name: "pattern fill", A: '<pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="red"/></pattern>', B: '<pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="blue"/></pattern>', use: '<rect width="120" height="80" fill="url(#p)"/>' },
  { name: "pattern href target", A: '<pattern id="base" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="red"/></pattern>', B: '<pattern id="base" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="blue"/></pattern>', use: '<pattern id="p" href="#base"/><rect width="120" height="80" fill="url(#p)"/>' },
  { name: "pattern href attributes only", A: '<pattern id="base" width="20" height="20" patternUnits="userSpaceOnUse"/>', B: '<pattern id="base" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="blue"/></pattern>', use: '<pattern id="p" href="#base"><rect width="10" height="10" fill="red"/></pattern><rect width="120" height="80" fill="url(#p)"/>' },
  { name: "gradient href target", A: '<linearGradient id="base"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="red"/></linearGradient>', B: '<linearGradient id="base"><stop offset="0" stop-color="blue"/><stop offset="1" stop-color="blue"/></linearGradient>', use: '<linearGradient id="g" href="#base"/><rect width="120" height="80" fill="url(#g)"/>' },
  { name: "clipPath", A: '<clipPath id="c"><rect width="30" height="30"/></clipPath>', B: '<clipPath id="c"><rect width="100" height="70"/></clipPath>', use: '<rect width="120" height="80" fill="green" clip-path="url(#c)"/>' },
  { name: "mask", A: '<mask id="k"><rect width="30" height="30" fill="white"/></mask>', B: '<mask id="k"><rect width="100" height="70" fill="white"/></mask>', use: '<rect width="120" height="80" fill="green" mask="url(#k)"/>' },
  { name: "id on different kinds (g first, gradient second)", A: '<g id="q"/>', B: '<linearGradient id="q"><stop offset="0" stop-color="blue"/><stop offset="1" stop-color="blue"/></linearGradient>', use: '<rect width="120" height="80" fill="url(#q)"/>' },
  { name: "id on different kinds (gradient first, g second)", A: '<linearGradient id="q"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="red"/></linearGradient>', B: '<g id="q"/>', use: '<rect width="120" height="80" fill="url(#q)"/>' },
];
  const manyShapes = Array.from({ length: 100 }, (_, i) => `<rect x="${i % 10}" y="${i % 8}" width="6" height="6" fill="blue"/>`).join("");
  const expensive = DUPLICATE_ID_CASES.filter(c => ["use of g/g", "marker-mid", "filter", "pattern fill", "pattern href target"].includes(c.name));
  for (const c of expensive) {
    const B = c.name === "filter" ? `<filter id="f">${blur(32).repeat(24)}</filter>`
      : c.name === "use of g/g" ? `<g id="x">${'<g>'.repeat(4)}${manyShapes}${'</g>'.repeat(4)}</g>`
      : c.name === "marker-mid" ? `<marker id="m" markerWidth="20" markerHeight="20" refX="10" refY="10">${manyShapes}</marker>`
      : `<pattern id="${c.name === "pattern fill" ? "p" : "base"}" width="1" height="1" patternUnits="userSpaceOnUse">${manyShapes}</pattern>`;
    DUPLICATE_ID_CASES.push({ ...c, name: `${c.name}: costly second definition`, B });
  }
  const whole = (defs: string, use: string) => wrap(`<defs>${defs}</defs>${use}`, 'width="120" height="80" viewBox="0 0 120 80"');
  const drawn = async (svg: string, through: "child" | "main") => {
    const file = svgFile(svg);
    const { buffer } = through === "child" ? await normalizeTrainingUpload(file) : await mainUpload.normalizeTrainingUpload(file);
    return (await pixels(buffer)).data;
  };
  it.each(DUPLICATE_ID_CASES.map(c => [c.name, c] as const))("%s: the picture with both definitions is the picture with the first alone, never the second alone", async (_name, c) => {
    const both = await drawn(whole(c.A + c.B, c.use), "child");
    const first = await drawn(whole(c.A, c.use), "child");
    const second = await drawn(whole(c.B, c.use), "child");
    expect(Buffer.compare(both, first)).toBe(0);
    expect(Buffer.compare(both, second), "the two definitions must draw differently for the case to prove anything").not.toBe(0);
    // Swapping the order swaps the winner.
    expect(Buffer.compare(await drawn(whole(c.B + c.A, c.use), "child"), second)).toBe(0);
    // And the child and `main`'s renderer agree on the document that has both.
    expect(Buffer.compare(both, await drawn(whole(c.A + c.B, c.use), "main"))).toBe(0);
  }, 60_000);
});

describe("the reviewed handoff profile (logo, flow 0) is exactly what `main` was", () => {
  const corpus: Array<[string, string | Buffer]> = [
    ["a simple logo", wrap('<circle cx="40" cy="40" r="32" fill="#c9573a"/><rect x="86" y="25" width="100" height="11" fill="#2a2a2a"/>', 'width="240" height="80" viewBox="0 0 240 80"')],
    ["with a style sheet and a gradient", wrap('<style>.a{fill:url(#g)}</style><defs><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect class="a" width="200" height="100"/>')],
    ["text", wrap('<text x="10" y="50" font-size="24">Brand</text>')],
    ...Object.entries({ ...SAME_AS_MAIN, ...REFUSED }).map(([name, svg]): [string, string] => [`training feature: ${name}`, svg]),
    ["embedded image", wrap(`<image href="${PIXEL}" width="50" height="50"/>`)],
    ["feImage", filter("", `<feImage href="${PIXEL}"/>`)],
    ["a script", wrap('<script>alert(1)</script><rect width="10" height="10"/>')],
    ["an external reference", wrap('<use href="http://example.com/a.svg#b"/>')],
    ["mask tree that crashes the renderer", readFileSync(fileURLToPath(new URL("./fixtures/mask-chain-crash.svg", import.meta.url)))],
    ["mask tree that is slow", readFileSync(fileURLToPath(new URL("./fixtures/mask-tree-slow.svg", import.meta.url)))],
    ["not xml", "garbage"],
  ];
  it.each(corpus.map(([name]) => name))("sanitizeSvg without a profile, %s: the same document or the same refusal as `main`", name => {
    const bytes = Buffer.from(corpus.find(([n]) => n === name)![1]);
    const expected = (() => { try { return { value: mainSanitize.sanitizeSvg(bytes) }; } catch (error) { return { code: (error as SvgLogoError).code }; } })();
    const actual = (() => { try { return { value: sanitizeSvg(bytes) }; } catch (error) { return { code: (error as SvgLogoError).code }; } })();
    expect(actual).toEqual(expected);
    // An explicit "no profile" is the same as none.
    const none = (() => { try { return { value: sanitizeSvg(bytes, {}) }; } catch (error) { return { code: (error as SvgLogoError).code }; } })();
    expect(none).toEqual(expected);
  });
  it("the drawing program of the logo, its memory ceiling and its output are `main`'s: the same source text, and the same PNG for a sanitized logo", async () => {
    expect(DRAW_WORKER_SOURCE).toBe(mainDraw.DRAW_WORKER_SOURCE);
    expect(DRAW_MAX_RSS_MB).toBe(mainDraw.DRAW_MAX_RSS_MB);
    expect(transport.DRAW_UNAVAILABLE_EXIT_CODE).toBe(mainDraw.DRAW_UNAVAILABLE_EXIT_CODE);
    for (const [, svg] of corpus.slice(0, 3)) {
      const { svg: clean } = mainSanitize.sanitizeSvg(Buffer.from(svg));
      const expected = await mainDraw.drawInChild(clean, { timeoutMs: 8000 });
      const actual = await drawInChild(clean, { timeoutMs: 8000 });
      expect(Buffer.compare(actual, expected)).toBe(0);
    }
  }, 60_000);
});

describe("the envelopes: AI keeps what `main` accepted (up to 50 MiB in, 17 MiB out); upload and measure keep 10 MiB; preflight accepts 50 MiB", () => {
  /** An incompressible 2048 x 2048 RGBA picture: its PNG is ~16.8 MB, bigger than the 10 MiB of the others and inside the AI envelope. */
  let noisy: Buffer;
  beforeAll(async () => {
    const raw = Buffer.alloc(2048 * 2048 * 4);
    let seed = 12345;
    for (let i = 0; i < raw.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; raw[i] = seed >>> 24; }
    for (let i = 3; i < raw.length; i += 4) raw[i] = i % 7 === 0 ? 0 : 255 - (i % 64);
    noisy = await sharp(raw, { raw: { width: 2048, height: 2048, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
  }, 120_000);
  it("the fixture is what the envelope is about: more than 10 MiB and less than 17 MiB", () => {
    expect(noisy.length).toBeGreaterThan(10 * 1024 * 1024);
    expect(noisy.length).toBeLessThan(17 * 1024 * 1024);
  });
  it("AI normalization of it is `main`'s, byte for byte, and the transparency verdict too", async () => {
    const expected = await mainNormalize.normalizeImageForAi({ buffer: noisy, mimeType: "image/png" });
    const actual = await normalizeImageForAi({ buffer: noisy, mimeType: "image/png" });
    expect(actual.mimeType).toBe("image/png");
    expect(actual.finalBytes).toBe(expected.finalBytes);
    expect(Buffer.compare(actual.buffer, expected.buffer)).toBe(0);
    expect(await mainNormalize.inspectUsableTransparency(noisy)).toBe(true);
    const { inspectUsableTransparency } = await import("@/server/ai/normalize-image-for-ai");
    expect(await inspectUsableTransparency(noisy)).toBe(true);
  }, 120_000);
  it("the 10 MiB callers refuse it by its size, with no process: measure, and the upload by the file size", async () => {
    child.mockClear();
    await expect(measureImageBuffer(noisy)).rejects.toThrow();
    await expect(normalizeTrainingUpload(new File([new Uint8Array(noisy)], "n.png", { type: "image/png" }))).rejects.toThrow("invalid_size");
    expect(child).not.toHaveBeenCalled();
  });
  it("over 50 MiB is refused for AI too, by the length alone, with no process", async () => {
    child.mockClear();
    await expect(normalizeImageForAi({ buffer: Buffer.alloc(50 * 1024 * 1024 + 1, 1) })).rejects.toBeInstanceOf(Error);
    expect(child).not.toHaveBeenCalled();
  });
  it("a hostile header inside the AI envelope is still refused by the header (a 20000 x 20000 PNG, 30001 x 1)", async () => {
    child.mockClear();
    for (const bytes of await Promise.all([{ width: 20_000, height: 20_000 }, { width: 30_001, height: 1 }].map(forgedPng))) await expect(normalizeImageForAi({ buffer: bytes })).rejects.toBeInstanceOf(Error);
    expect(child).not.toHaveBeenCalled();
  });
});

afterAll(() => { /* nothing is left running: every child has ended with its call */ });
