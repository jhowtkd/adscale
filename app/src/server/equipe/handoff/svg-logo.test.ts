import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SVG_RENDER_TIMEOUT_MS, SvgLogoError, rasterizeSvgLogo, type SvgRejection } from "./svg-logo";
import { MAX_SVG_BYTES, SVG_LOGO_LONG_SIDE_PX } from "./svg-sanitize";

// The drawing is done by `drawInChild` (a process of its own). It is the real one, behind a spy that sees every call, unless a test puts a controlled one in `probe.impl`: that is how
// the queue, the deadline and the abort are proved without a clock deciding what is in progress and what is waiting.
const probe = vi.hoisted(() => ({
  calls: [] as Array<{ svg: string; options: { timeoutMs: number; signal?: AbortSignal } }>,
  inFlight: 0, maxInFlight: 0,
  impl: null as null | ((svg: string, options: { timeoutMs: number; signal?: AbortSignal }) => Promise<Buffer>),
}));
vi.mock("./svg-draw-child", async importOriginal => {
  const actual = await importOriginal<typeof import("./svg-draw-child")>();
  return {
    ...actual,
    drawInChild: vi.fn((svg: string, options: { timeoutMs: number; signal?: AbortSignal }) => {
      probe.calls.push({ svg, options });
      probe.inFlight++; probe.maxInFlight = Math.max(probe.maxInFlight, probe.inFlight);
      return (probe.impl ? probe.impl(svg, options) : actual.drawInChild(svg, options)).finally(() => { probe.inFlight--; });
    }),
  };
});

beforeEach(() => { probe.impl = null; probe.calls.length = 0; probe.maxInFlight = 0; });

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const bytes = (text: string) => Buffer.from(text, "utf8");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function codeOf(input: string | Uint8Array, options?: Parameters<typeof rasterizeSvgLogo>[1]): Promise<SvgRejection | "ok"> {
  try { await rasterizeSvgLogo(typeof input === "string" ? bytes(input) : input, options); return "ok"; }
  catch (error) {
    if (!(error instanceof SvgLogoError)) throw error;
    return error.code;
  }
}

/** Pixels that are visibly red: the colour of the canary. */
async function redPixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i + 3]! > 0 && data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60) count++;
  return count;
}

const SIMPLE = `<svg ${NS} width="240" height="80" viewBox="0 0 240 80"><circle cx="40" cy="40" r="32" fill="#c9573a"/><rect x="86" y="25" width="132" height="11" rx="5.5" fill="#2b1a10"/></svg>`;
const ILLUSTRATOR = `<?xml version="1.0" encoding="utf-8"?><!-- Generator: Adobe Illustrator 26 --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/"><!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">]><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:x="&ns_extend;" xmlns:i="&ns_ai;" x="0px" y="0px" viewBox="0 0 200 100" style="enable-background:new 0 0 200 100;" xml:space="preserve"><style type="text/css">.st0{fill:#E4002B;}.st1{fill:none;stroke:#231F20;stroke-width:4;stroke-miterlimit:10;}@media (prefers-color-scheme: dark){.st0{fill:#fff}}</style><switch><foreignObject requiredExtensions="&ns_ai;" x="0" y="0" width="1" height="1"/><g i:extraneous="self"><circle class="st0" cx="50" cy="50" r="40"/><rect class="st1" x="100" y="20" width="80" height="60"/></g></switch></svg>`;
const INKSCAPE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><svg xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="210mm" height="297mm" viewBox="0 0 210 297" version="1.1" id="svg8" inkscape:version="1.0"><defs id="defs2"><linearGradient id="g1"><stop offset="0" style="stop-color:#ff0000;stop-opacity:1"/><stop offset="1" style="stop-color:#0000ff;stop-opacity:1"/></linearGradient></defs><sodipodi:namedview id="base" pagecolor="#ffffff"/><metadata id="metadata5"><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format></cc:Work></rdf:RDF></metadata><g inkscape:label="Layer 1" id="layer1"><rect style="fill:url(#g1);stroke:none" id="rect10" width="100" height="100" x="10" y="10"/></g></svg>`;
// A rectangle next to the text: the picture does not depend on the machine having a font.
const WORDMARK = `<svg ${NS} width="200" height="50" viewBox="0 0 200 50"><rect x="0" y="5" width="30" height="30" fill="#6B46C1"/><text x="40" y="35" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#111">ACME</text></svg>`;

describe("rasterizeSvgLogo: legitimate logos become a PNG", () => {

  it("draws plain shapes: PNG signature, 1024 px on the longest side, the proportion kept", async () => {
    const { png, width, height } = await rasterizeSvgLogo(bytes(SIMPLE));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect({ width: meta.width, height: meta.height }).toEqual({ width, height });
    expect(Math.max(width, height)).toBe(SVG_LOGO_LONG_SIDE_PX);
    expect(width).toBe(1024);
    expect(width / height).toBeCloseTo(240 / 80, 1);
  });

  it("keeps the transparency of a logo that does not cover the frame", async () => {
    const { png } = await rasterizeSvgLogo(bytes(SIMPLE));
    const meta = await sharp(png).metadata();
    expect(meta.hasAlpha).toBe(true);
    const [, , , alpha] = (await sharp(png).stats()).channels;
    expect(alpha!.min).toBe(0);
    expect(alpha!.max).toBe(255);
    // The corner is empty, the circle is the colour that was asked for.
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    const at = (x: number, y: number) => { const o = (y * 1024 + x) * 4; return [...data.subarray(o, o + 4)]; };
    expect(at(170, 170)).toEqual([0xc9, 0x57, 0x3a, 255]);
  });

  it("draws a tall logo with the longest side as the height", async () => {
    const { png, width, height } = await rasterizeSvgLogo(bytes(INKSCAPE));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect({ width, height }).toEqual({ width: 724, height: 1024 });
    expect(await redPixels(png)).toBeGreaterThan(0); // The left end of the gradient.
  });

  it("draws an Illustrator file (entity in the namespace, <style> classes, switch/foreignObject, @media)", async () => {
    const { png, width, height } = await rasterizeSvgLogo(bytes(ILLUSTRATOR));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect({ width, height }).toEqual({ width: 1024, height: 512 });
    // `.st0` is #E4002B, and the dark-mode @media that would make it white is gone.
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const o = (256 * 1024 + 256) * 4;
    expect([...data.subarray(o, o + 4)]).toEqual([0xe4, 0x00, 0x2b, 255]);
  });

  it("draws text next to shapes", async () => {
    const { png, width, height } = await rasterizeSvgLogo(bytes(WORDMARK));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect({ width, height }).toEqual({ width: 1024, height: 256 });
  });

  it("ignores a hostile declared size: 100000 x 100000 is drawn at 1024 x 1024", async () => {
    const huge = `<svg ${NS} width="100000" height="100000"><rect width="50000" height="100000" fill="#123456"/></svg>`;
    const { png, width, height } = await rasterizeSvgLogo(bytes(huge));
    expect({ width, height }).toEqual({ width: 1024, height: 1024 });
    const meta = await sharp(png).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 1024, height: 1024 });
    expect(png.length).toBeLessThan(200_000);
  });

  it("ignores a hostile viewBox: 1e6 is a coordinate space, not a pixel count", async () => {
    const huge = `<svg ${NS} viewBox="0 0 1000000 1000000"><rect width="500000" height="1000000" fill="#123456"/></svg>`;
    const { width, height } = await rasterizeSvgLogo(bytes(huge));
    expect({ width, height }).toEqual({ width: 1024, height: 1024 });
  });

  it("draws the same file to the same bytes every time", async () => {
    const a = await rasterizeSvgLogo(bytes(SIMPLE)), b = await rasterizeSvgLogo(bytes(SIMPLE));
    expect(a.png.equals(b.png)).toBe(true);
  });
});

describe("rasterizeSvgLogo: files that are rejected", () => {

  it("rejects what the sanitizer rejects, with its code, before anything is drawn", async () => {
    expect(await codeOf(Buffer.alloc(MAX_SVG_BYTES + 1))).toBe("svg_too_large");
    expect(await codeOf("")).toBe("svg_malformed");
    expect(await codeOf(`<svg ${NS} width="10" height="10"><g>`)).toBe("svg_malformed");
    expect(await codeOf(`<svg ${NS}><rect width="1" height="1"/></svg>`)).toBe("svg_unsupported");
    expect(await codeOf(`<svg ${NS} viewBox="0 0 1 100000"><rect width="1" height="100000"/></svg>`)).toBe("svg_unsupported");
    expect(await codeOf(`<svg ${NS} viewBox="0 0 10 10">${"<g>".repeat(200)}</svg>`)).toBe("svg_too_complex");
    expect(probe.calls).toHaveLength(0);
  });

  it.each([
    ["only a script", `<svg ${NS} width="10" height="10"><script>alert(1)</script></svg>`],
    ["only an image", `<svg ${NS} width="10" height="10"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>`],
    ["only a foreignObject", `<svg ${NS} width="10" height="10"><foreignObject width="10" height="10"/></svg>`],
    ["nothing at all", `<svg ${NS} width="10" height="10"/>`],
    ["shapes that draw nothing", `<svg ${NS} width="10" height="10"><rect width="0" height="0" fill="red"/><circle cx="5" cy="5" r="0"/><rect width="5" height="5" fill="none"/></svg>`],
    ["shapes that are invisible", `<svg ${NS} width="10" height="10"><rect width="5" height="5" opacity="0"/><rect width="5" height="5" display="none"/></svg>`],
    ["only things outside the frame", `<svg ${NS} width="10" height="10"><rect x="100" y="100" width="5" height="5"/></svg>`],
  ])("%s is no logo: svg_empty", async (_name, input) => {
    expect(await codeOf(input)).toBe("svg_empty");
  });

  it("the message of the error is its code, never the content of the file", async () => {
    const secret = "SECRET-TOKEN-4711";
    const inputs = [
      `<svg ${NS} width="10" height="10"><text>${secret}&nope;</text></svg>`,
      `<svg ${NS} width="10" height="10"><text>${secret}</text><script>${secret}</script>`,
      `<svg ${NS}><desc>${secret}</desc></svg>`,
      `<svg ${NS} width="10" height="10"><script>${secret}</script></svg>`,
      `<html>${secret}</html>`,
      `${secret}`,
      `<svg ${NS} width="10" height="10" ${secret}="1"/>`,
    ];
    for (const input of inputs) {
      const error = await rasterizeSvgLogo(bytes(input)).then(() => null, (e: unknown) => e);
      expect(error, input).toBeInstanceOf(SvgLogoError);
      const failure = error as SvgLogoError;
      expect(failure.message).toBe(failure.code);
      expect(failure.name).toBe("SvgLogoError");
      expect(JSON.stringify(failure) + String(failure.stack).split("\n")[0]).not.toContain(secret);
    }
  });

  it("cycles of gradients, masks, clip paths and references to themselves are refused (svg_too_complex) at once, by the sanitizer: nothing is drawn", async () => {
    const cycles = [
      `<svg ${NS} ${XLINK} viewBox="0 0 10 10"><defs><linearGradient id="a" xlink:href="#b"/><linearGradient id="b" xlink:href="#a"/></defs><rect width="10" height="10" fill="url(#a)"/></svg>`,
      `<svg ${NS} viewBox="0 0 10 10"><defs><mask id="m" mask="url(#m)"><rect width="10" height="10" fill="#fff" mask="url(#m)"/></mask></defs><rect width="10" height="10" fill="red" mask="url(#m)"/></svg>`,
      `<svg ${NS} viewBox="0 0 10 10"><defs><clipPath id="c" clip-path="url(#c)"><rect width="5" height="5"/></clipPath></defs><rect width="10" height="10" fill="red" clip-path="url(#c)"/></svg>`,
      `<svg ${NS} ${XLINK} viewBox="0 0 10 10"><defs><linearGradient id="a" xlink:href="#a"/></defs><rect width="10" height="10" fill="url(#a)"/></svg>`,
    ];
    for (const input of cycles) {
      const started = performance.now();
      expect(await codeOf(input), input).toBe("svg_too_complex");
      expect(performance.now() - started, input).toBeLessThan(1000);
    }
    expect(probe.calls).toHaveLength(0);
  });

  it("a <use> that points at a group with a <use> in it is cut by the sanitizer, so what is left is drawn", async () => {
    const { png } = await rasterizeSvgLogo(bytes(`<svg ${NS} ${XLINK} viewBox="0 0 10 10"><defs><g id="a"><use href="#a"/></g><symbol id="s"><use href="#s"/><rect width="1" height="1"/></symbol></defs><use href="#a"/><use href="#s"/><rect width="5" height="5"/></svg>`));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });

  it("the two files of the review are refused as svg_too_complex in a few milliseconds and never reach the drawing", async () => {
    for (const name of ["mask-chain-crash.svg", "mask-tree-slow.svg"]) {
      const started = performance.now();
      expect(await codeOf(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)))), name).toBe("svg_too_complex");
      expect(performance.now() - started, name).toBeLessThan(1000);
    }
    expect(probe.calls).toHaveLength(0);
  });

  it("everything the sanitizer refuses, on the way, is refused before the drawing: no process is started", async () => {
    const refused: Array<[string, string | Uint8Array]> = [
      ["a chain of 7 masks", `<svg ${NS} viewBox="0 0 10 10"><defs><mask id="m0"><rect width="9" height="9"/></mask>${Array.from({ length: 6 }, (_, i) => `<mask id="m${i + 1}" mask="url(#m${i})"><rect width="9" height="9"/></mask>`).join("")}</defs><rect width="5" height="5" mask="url(#m6)"/></svg>`],
      ["47 nested groups", `<svg ${NS} viewBox="0 0 10 10">${"<g>".repeat(47)}<rect width="5" height="5"/>${"</g>".repeat(47)}</svg>`],
      ["malformed", `<svg ${NS} width="10" height="10"><g>`],
      ["too large", Buffer.alloc(MAX_SVG_BYTES + 1)],
    ];
    for (const [name, input] of refused) await expect(rasterizeSvgLogo(typeof input === "string" ? bytes(input) : input), name).rejects.toBeInstanceOf(SvgLogoError);
    expect(probe.calls).toHaveLength(0);
  });

  it("draws, without side effects, the things that hang renderers when they are not left out: dashes, filters, patterns", async () => {
    const started = performance.now();
    const { png } = await rasterizeSvgLogo(bytes(`<svg ${NS} viewBox="0 0 100 100"><filter id="f"><feGaussianBlur stdDeviation="100000"/></filter><pattern id="p" width="0.0001" height="0.0001"><rect width="1" height="1"/></pattern><path d="M0 0L100000 100000" stroke="red" stroke-width="1" stroke-dasharray="0.00001"/><rect width="50" height="50" fill="url(#p)" style="filter:url(#f)"/><circle cx="75" cy="75" r="20" fill="#0000ff"/></svg>`));
    expect(performance.now() - started).toBeLessThan(2000);
    // The circle is drawn last, over a plain stroke (the dashes are left out, so the line is solid) and no filter or pattern.
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const o = (768 * 1024 + 768) * 4;
    expect([...data.subarray(o, o + 4)]).toEqual([0, 0, 255, 255]);
  });

  it("a group used by many <use> elements within the budget still draws", async () => {
    const group = `<g id="big">${"<rect width='1' height='1' fill='#00aa00'/>".repeat(2000)}</g>`;
    const { png } = await rasterizeSvgLogo(bytes(`<svg ${NS} viewBox="0 0 10 10"><defs>${group}</defs>${'<use href="#big"/>'.repeat(4)}</svg>`));
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });
});

describe("rasterizeSvgLogo: nothing outside the file is read", () => {
  let server: Server, port = 0, directory = "", canaryPng = "", canarySvg = "";
  const hits: string[] = [];

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "svg-canary-"));
    canaryPng = join(directory, "canary.png");
    canarySvg = join(directory, "canary.svg");
        const red = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#ff0000" } }).png().toBuffer();
    await writeFile(canaryPng, red);
    await writeFile(canarySvg, `<svg ${NS} id="a" width="40" height="40"><rect id="a" width="40" height="40" fill="#ff0000"/></svg>`);
    server = createServer((request, response) => {
      hits.push(`${request.method} ${request.url}`);
      response.writeHead(200, { "content-type": request.url?.endsWith(".css") ? "text/css" : "image/png" });
      response.end(red);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  beforeEach(() => { hits.length = 0; });

  const frame = (extra: string, rect = '<rect width="60" height="100" fill="#1f4fd8"/>', head = "") => `${head}<svg ${NS} ${XLINK} width="100" height="100">${rect}${extra}</svg>`;
  const url = () => `http://127.0.0.1:${port}`;
  const file = (path: string) => pathToFileURL(path).href;

  it("the red canary really is red, and the server really answers (so a leak would show)", async () => {
    const response = await fetch(`${url()}/probe.png`);
    expect(response.status).toBe(200);
    expect(await redPixels(Buffer.from(await response.arrayBuffer()))).toBeGreaterThan(1000);
    hits.length = 0;
  });

  it.each<[string, () => { hostile: string; control: string }]>([
    ["<image> from the network", () => ({ hostile: frame(`<image href="${url()}/x.png" x="0" y="0" width="100" height="100"/>`), control: frame("") })],
    ["<image> with xlink:href from the network", () => ({ hostile: frame(`<image xlink:href="${url()}/x.png" x="0" y="0" width="100" height="100"/>`), control: frame("") })],
    ["<image> from a file", () => ({ hostile: frame(`<image xlink:href="${file(canaryPng)}" x="0" y="0" width="100" height="100"/>`), control: frame("") })],
    ["<image> from a file, with href and a bare path", () => ({ hostile: frame(`<image href="${file(canaryPng)}" width="100" height="100"/><image href="${canaryPng}" width="100" height="100"/>`), control: frame("") })],
    ["<use> of a document on the network", () => ({ hostile: frame(`<use href="${url()}/e.svg#a"/><use xlink:href="${url()}/e.svg#a"/>`), control: frame("") })],
    ["<use> of a document on disk", () => ({ hostile: frame(`<use href="${file(canarySvg)}#a"/><use xlink:href="${file(canarySvg)}#a"/>`), control: frame("") })],
    ["@import in <style>", () => ({ hostile: frame("", '<rect width="60" height="100" fill="#1f4fd8"/>', "").replace("<rect", `<style>@import url(${url()}/a.css); @import "${file(canaryPng)}";</style><rect`), control: frame("") })],
    ["@font-face in <style>", () => ({ hostile: frame(`<style>@font-face{font-family:x;src:url(${url()}/f.woff)} text{font-family:x}</style>`), control: frame("") })],
    ["fill:url(http) in <style>", () => ({ hostile: frame(`<style>rect{fill:url(${url()}/b.png)}</style>`), control: frame("") })],
    ["fill:url(http) in a style attribute", () => ({ hostile: frame("", `<rect width="60" height="100" style="fill:url(${url()}/c.png)"/>`), control: frame("", '<rect width="60" height="100"/>') })],
    ["fill:url(file) in a fill attribute", () => ({ hostile: frame("", `<rect width="60" height="100" fill="url(${file(canaryPng)})"/>`), control: frame("", '<rect width="60" height="100"/>') })],
    ["external hrefs on gradients, text paths and a symbol", () => ({ hostile: frame(`<defs><linearGradient id="g" xlink:href="${url()}/g.svg#a"/><radialGradient id="r" href="${file(canarySvg)}#a"/></defs><text x="0" y="9"><textPath href="${url()}/p.svg#p">hi</textPath></text><circle cx="50" cy="50" r="20" fill="url(#g)"/>`), control: frame('<defs><linearGradient id="g"/><radialGradient id="r"/></defs><circle cx="50" cy="50" r="20" fill="url(#g)"/>') })],
    ["<feImage> in a filter", () => ({ hostile: frame(`<filter id="f"><feImage href="${url()}/x.png"/></filter><circle cx="50" cy="50" r="20" filter="url(#f)"/>`), control: frame('<circle cx="50" cy="50" r="20"/>') })],
    ["<foreignObject> with an <img> and an <iframe>", () => ({ hostile: frame(`<foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><img src="${url()}/f.png"/><iframe src="${file(canarySvg)}"/></div></foreignObject>`), control: frame("") })],
    ["a pattern with an <image>", () => ({ hostile: frame(`<pattern id="p" width="10" height="10"><image href="${url()}/p.png" width="10" height="10"/></pattern><circle cx="50" cy="50" r="20" fill="url(#p)"/>`), control: frame("") })],
    ["an external DTD", () => ({ hostile: frame("", '<rect width="60" height="100" fill="#1f4fd8"/>', `<?xml version="1.0"?><!DOCTYPE svg SYSTEM "${url()}/evil.dtd">`), control: frame("") })],
    ["an external DTD with a public id and an internal subset", () => ({ hostile: frame("", '<rect width="60" height="100" fill="#1f4fd8"/>', `<!DOCTYPE svg PUBLIC "-//X//Y" "${url()}/evil.dtd" [<!ENTITY a SYSTEM "${file(canaryPng)}"> <!ENTITY b SYSTEM "${url()}/e">]>`), control: frame("") })],
    ["an XML stylesheet", () => ({ hostile: frame("", '<rect width="60" height="100" fill="#1f4fd8"/>', `<?xml-stylesheet href="${url()}/s.css" type="text/css"?>`), control: frame("") })],
    ["<a> and a <script> that fetch", () => ({ hostile: frame(`<script>fetch("${url()}/s")</script><a href="${url()}/l"><circle cx="50" cy="50" r="20"/></a>`, '<rect width="60" height="100" fill="#1f4fd8"/>').replace("<circle", "<circle"), control: frame(`<circle cx="50" cy="50" r="20"/>`) })],
  ])("%s: nothing is requested, and the picture is the one without it", async (_name, build) => {
    const { hostile, control } = build();
    const a = await rasterizeSvgLogo(bytes(hostile));
    const b = await rasterizeSvgLogo(bytes(control));
    await sleep(50);
    expect(hits).toEqual([]);
    expect(a.png.equals(b.png)).toBe(true);
    expect(await redPixels(a.png)).toBe(0);
  });

  it.each<[string, string]>([
    ["an external entity (http) used in the text", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "http://127.0.0.1:PORT/e">]><svg ${NS} width="300" height="60"><text x="0" y="30">&xxe;</text></svg>`],
    ["an external entity (file) used in the text", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "FILE">]><svg ${NS} width="300" height="60"><text x="0" y="30">&xxe;</text></svg>`],
    ["a parameter entity that loads a DTD", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY % d SYSTEM "http://127.0.0.1:PORT/e.dtd"> %d;]><svg ${NS} width="300" height="60"><text x="0" y="30">&x;</text></svg>`],
  ])("%s: rejected as malformed and nothing is requested", async (_name, template) => {
    const input = template.replaceAll("PORT", String(port)).replaceAll("FILE", file(canaryPng));
    expect(await codeOf(input)).toBe("svg_malformed");
    await sleep(50);
    expect(hits).toEqual([]);
  });

  it("a CSS escape that hides an @import is rejected, and nothing is requested", async () => {
    expect(await codeOf(frame(`<style>@\\69mport url(${url()}/a.css);</style>`))).toBe("svg_unsupported");
    await sleep(50);
    expect(hits).toEqual([]);
  });
});

// What the drawing process is told, and how the line in front of it behaves, with a controlled `drawInChild` (nothing is drawn: each draw ends when the test says).
describe("rasterizeSvgLogo: the drawing process, the deadline and the line", () => {
  type Options = { timeoutMs: number; signal?: AbortSignal };
  type Draw = { svg: string; options: Options; finish: (png?: Buffer) => void; fail: (error: unknown) => void };
  const WAITING = 6; // MAX_WAITING: drawings that may wait behind the one in progress.
  const fakePng = (width = 1024, height = 341) => {
    const png = Buffer.alloc(33);
    PNG_SIGNATURE.copy(png);
    png.writeUInt32BE(13, 8); png.write("IHDR", 12, "ascii"); png.writeUInt32BE(width, 16); png.writeUInt32BE(height, 20);
    return png;
  };
  /** Every draw waits for the test. Aborting the signal ends it with the reason, as the real one does by killing its process. */
  function controlled() {
    const draws: Draw[] = [];
    probe.impl = (svg, options) => new Promise<Buffer>((resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      draws.push({ svg, options, finish: (png = fakePng()) => resolve(png), fail: reject });
    });
    return draws;
  }
  const started = (draws: Draw[], count: number) => vi.waitFor(() => expect(draws).toHaveLength(count));
  const distinct = (i: number) => bytes(`<svg ${NS} viewBox="0 0 10 10"><rect width="${i + 1}" height="5"/></svg>`);

  it("hands the process the sanitized SVG (never the file as it came), the deadline, and a signal", async () => {
    const draws = controlled();
    const hostile = `<svg ${NS} width="100" height="50" onload="alert(1)"><script>alert(1)</script><image href="http://127.0.0.1:1/x.png"/><rect width="10" height="10"/></svg>`;
    const running = rasterizeSvgLogo(bytes(hostile));
    await started(draws, 1);
    expect(draws[0]!.svg).toContain("<rect");
    expect(draws[0]!.svg).not.toMatch(/<script|<image|onload|127\.0\.0\.1/);
    expect(draws[0]!.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(draws[0]!.options.timeoutMs).toBe(SVG_RENDER_TIMEOUT_MS);
    expect(draws[0]!.options.signal).toBeInstanceOf(AbortSignal);
    draws[0]!.finish();
    await running;
    const second = rasterizeSvgLogo(bytes(SIMPLE), { timeoutMs: 1234 });
    await started(draws, 2);
    expect(draws[1]!.options.timeoutMs).toBe(1234);
    draws[1]!.finish();
    await second;
  });

  it("the size is read from the PNG that came back, not taken from anything else; what is not a PNG is svg_render_failed", async () => {
    const draws = controlled();
    const ok = rasterizeSvgLogo(bytes(SIMPLE));
    await started(draws, 1);
    const png = fakePng(777, 55);
    draws[0]!.finish(png);
    expect(await ok).toEqual({ png, width: 777, height: 55 });

    for (const [i, bad] of [Buffer.from("not a png at all, just text"), Buffer.alloc(0), fakePng().subarray(0, 20), Buffer.concat([PNG_SIGNATURE, Buffer.alloc(30)])].entries()) {
      const failing = rasterizeSvgLogo(bytes(SIMPLE));
      await started(draws, i + 2);
      draws[i + 1]!.finish(bad);
      await expect(failing, `bad #${i}`).rejects.toMatchObject({ code: "svg_render_failed", message: "svg_render_failed" });
    }
  });

  it("what the drawing process says is passed on: svg_empty, svg_too_complex, svg_render_failed and svg_timeout keep their code", async () => {
    const draws = controlled();
    for (const [i, code] of (["svg_empty", "svg_too_complex", "svg_render_failed", "svg_timeout"] as const).entries()) {
      const running = rasterizeSvgLogo(bytes(SIMPLE));
      await started(draws, i + 1);
      draws[i]!.fail(new SvgLogoError(code));
      await expect(running, code).rejects.toMatchObject({ code, message: code });
    }
  });

  it("a refused file is refused before the line is looked at and before any process: an aborted signal still says what is wrong with the file", async () => {
    const draws = controlled();
    await expect(rasterizeSvgLogo(bytes(""), { signal: AbortSignal.abort(new Error("late")) })).rejects.toMatchObject({ code: "svg_malformed" });
    expect(draws).toHaveLength(0);
  });

  it("an already aborted signal rejects with its reason and starts nothing", async () => {
    const draws = controlled();
    const reason = new Error("stopped by the reading");
    await expect(rasterizeSvgLogo(bytes(SIMPLE), { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    await expect(rasterizeSvgLogo(bytes(SIMPLE), { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(draws).toHaveLength(0);
    expect(probe.calls).toHaveLength(0);
  });

  it("aborting while it draws rejects with the signal's reason and aborts the signal the process was given (that is what kills it)", async () => {
    const draws = controlled();
    const controller = new AbortController();
    const running = rasterizeSvgLogo(bytes(SIMPLE), { signal: controller.signal });
    await started(draws, 1);
    expect(draws[0]!.options.signal!.aborted).toBe(false);
    const reason = new Error("gone");
    controller.abort(reason);
    await expect(running).rejects.toBe(reason);
    expect(draws[0]!.options.signal!.aborted).toBe(true);
    expect(draws[0]!.options.signal!.reason).toBe(reason);
  });

  it("the deadline aborts the signal of the process with svg_timeout, and the caller gets svg_timeout (message = code)", async () => {
    const draws = controlled();
    const error = await (async () => { const running = rasterizeSvgLogo(bytes(SIMPLE), { timeoutMs: 40 }); return running.then(() => null, (e: unknown) => e); })();
    expect(error).toBeInstanceOf(SvgLogoError);
    expect(error).toMatchObject({ code: "svg_timeout", message: "svg_timeout" });
    expect(draws).toHaveLength(1);
    expect(draws[0]!.options.signal!.aborted).toBe(true);
    expect(draws[0]!.options.signal!.reason).toMatchObject({ code: "svg_timeout" });
  });

  it("the deadline counts the wait for the turn: a call stuck in the line gives up with svg_timeout and its process is never started", async () => {
    const draws = controlled();
    const first = rasterizeSvgLogo(bytes(SIMPLE));
    await started(draws, 1);
    await expect(rasterizeSvgLogo(bytes(ILLUSTRATOR), { timeoutMs: 40 })).rejects.toMatchObject({ code: "svg_timeout" });
    draws[0]!.finish();
    await first;
    await sleep(30); // The turn of the one that gave up has come and gone.
    expect(draws).toHaveLength(1);
    expect(probe.calls).toHaveLength(1);
  });

  it("aborting while waiting in the line rejects with the reason and the process is never started", async () => {
    const draws = controlled();
    const first = rasterizeSvgLogo(bytes(SIMPLE));
    await started(draws, 1);
    const controller = new AbortController();
    const waiting = rasterizeSvgLogo(bytes(ILLUSTRATOR), { signal: controller.signal });
    controller.abort(new Error("changed my mind"));
    await expect(waiting).rejects.toThrow("changed my mind");
    draws[0]!.finish();
    await first;
    await sleep(30);
    expect(probe.calls).toHaveLength(1);
  });

  it("one drawing at a time: the next process starts only when the one in progress is over", async () => {
    const draws = controlled();
    const runs = [rasterizeSvgLogo(distinct(0))];
    await started(draws, 1);
    runs.push(rasterizeSvgLogo(distinct(1)), rasterizeSvgLogo(distinct(2)));
    await sleep(30);
    expect(draws).toHaveLength(1);
    draws[0]!.finish();
    await started(draws, 2);
    expect(probe.inFlight).toBe(1);
    draws[1]!.finish();
    await started(draws, 3);
    draws[2]!.finish();
    expect((await Promise.all(runs)).map(run => run.width)).toEqual([1024, 1024, 1024]);
    expect(probe.maxInFlight).toBe(1);
  });

  it("a drawing that fails does not stop the ones behind it, and the place is freed when the process is killed at the deadline", async () => {
    const draws = controlled();
    const failing = rasterizeSvgLogo(bytes(SIMPLE), { timeoutMs: 40 });
    const behind = rasterizeSvgLogo(bytes(ILLUSTRATOR));
    await expect(failing).rejects.toMatchObject({ code: "svg_timeout" }); // Its signal aborted: the fake process ended, as a killed one does.
    await started(draws, 2); // The one behind it got the place.
    draws[1]!.finish();
    expect((await behind).png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    const error = rasterizeSvgLogo(bytes(SIMPLE));
    await started(draws, 3);
    draws[2]!.fail(new SvgLogoError("svg_render_failed"));
    await expect(error).rejects.toMatchObject({ code: "svg_render_failed" });
    const after = rasterizeSvgLogo(bytes(SIMPLE));
    await started(draws, 4);
    draws[3]!.finish();
    await after;
  });

  describe("the waiting line is bounded", () => {
    it("one in progress and six waiting is all it takes: the eighth is refused at once with svg_busy, starts no process, and the seven all finish", async () => {
      const draws = controlled();
      const accepted: Array<Promise<{ png: Buffer }>> = [rasterizeSvgLogo(distinct(0))];
      await started(draws, 1); // The first is being drawn...
      for (let i = 1; i <= WAITING; i++) accepted.push(rasterizeSvgLogo(distinct(i))); // ...and six wait for their turn.

      const error = await rasterizeSvgLogo(distinct(7)).then(() => null, (e: unknown) => e); // Settles while the first still draws: refused, not queued.
      expect(error).toBeInstanceOf(SvgLogoError);
      expect(error).toMatchObject({ code: "svg_busy", message: "svg_busy", name: "SvgLogoError" });
      expect(probe.calls).toHaveLength(1);
      for (const i of [8, 9]) await expect(rasterizeSvgLogo(distinct(i))).rejects.toMatchObject({ code: "svg_busy" });

      for (let i = 0; i <= WAITING; i++) { await started(draws, i + 1); draws[i]!.finish(); }
      const done = await Promise.all(accepted);
      expect(done).toHaveLength(7);
      expect(probe.calls).toHaveLength(7); // Not eight: the refused one never started a process.
      expect(probe.maxInFlight).toBe(1);

      const after = rasterizeSvgLogo(bytes(SIMPLE)); // The line is empty again: a new call is accepted.
      await started(draws, 8);
      draws[7]!.finish();
      expect((await after).width).toBe(1024);
    });

    it("six waiting is still accepted: the line is refused past the sixth, not at it", async () => {
      const draws = controlled();
      const accepted = [rasterizeSvgLogo(distinct(0))];
      await started(draws, 1);
      for (let i = 1; i <= WAITING; i++) accepted.push(rasterizeSvgLogo(distinct(i)));
      for (let i = 0; i <= WAITING; i++) { await started(draws, i + 1); draws[i]!.finish(); }
      expect((await Promise.allSettled(accepted)).every(result => result.status === "fulfilled")).toBe(true);
    });

    it("a place frees as the line moves: when the one in progress ends, a new call can wait again", async () => {
      const draws = controlled();
      const accepted = [rasterizeSvgLogo(distinct(0))];
      await started(draws, 1);
      for (let i = 1; i <= WAITING; i++) accepted.push(rasterizeSvgLogo(distinct(i)));
      await expect(rasterizeSvgLogo(distinct(20))).rejects.toMatchObject({ code: "svg_busy" });
      draws[0]!.finish();
      await started(draws, 2); // The next one has started: one place is free.
      accepted.push(rasterizeSvgLogo(distinct(21)));
      for (let i = 1; i <= WAITING + 1; i++) { await started(draws, i + 1); draws[i]!.finish(); }
      expect((await Promise.all(accepted)).length).toBe(8);
    });

    it("a file that cannot be read is refused for what it is before the line is looked at, and takes no place", async () => {
      const draws = controlled();
      const accepted = [rasterizeSvgLogo(distinct(0))];
      await started(draws, 1);
      for (let i = 1; i <= WAITING; i++) accepted.push(rasterizeSvgLogo(distinct(i)));
      await expect(rasterizeSvgLogo(bytes("not an svg"))).rejects.toMatchObject({ code: "svg_malformed" });
      await expect(rasterizeSvgLogo(bytes(SIMPLE))).rejects.toMatchObject({ code: "svg_busy" });
      for (let i = 0; i <= WAITING; i++) { await started(draws, i + 1); draws[i]!.finish(); }
      await Promise.all(accepted);
    });
  });
});

// The isolation, end to end: the real process, a file the sanitizer lets through and that takes far too long to draw.
describe("rasterizeSvgLogo: a drawing that takes too long is killed, and the next logo draws", () => {
  /** The drawing processes this test process started and that are still alive. */
  const workers = () => execFileSync("ps", ["-eo", "pid=,ppid=,command="], { encoding: "utf8" }).split("\n")
    .filter(line => line.includes("--max-old-space-size=48") && Number(line.trim().split(/\s+/)[1]) === process.pid).map(line => Number(line.trim().split(/\s+/)[0]));

  it("a heavy file with a short deadline answers svg_timeout near the deadline, kills its process, and a simple logo then draws normally", async () => {
    // 4,000 half transparent layers: each is drawn into a surface of its own. Nothing the sanitizer refuses, and about ten seconds to draw.
    const heavy = `<svg ${NS} viewBox="0 0 100 100">${'<rect width="100" height="100" fill="#f00" opacity=".5"/>'.repeat(4000)}</svg>`;
    expect(heavy.length).toBeGreaterThan(200_000);
    const began = performance.now();
    const error = await rasterizeSvgLogo(bytes(heavy), { timeoutMs: 800 }).then(() => null, (e: unknown) => e);
    const took = performance.now() - began;
    expect(error).toBeInstanceOf(SvgLogoError);
    expect(error).toMatchObject({ code: "svg_timeout" });
    expect(took).toBeGreaterThan(700);
    expect(took).toBeLessThan(5000); // Generous: it was given 800 ms, and ten seconds of drawing did not run to its end.
    expect(probe.calls).toHaveLength(1);

    const { png, width } = await rasterizeSvgLogo(bytes(SIMPLE)); // The place was freed: this is not waiting for the heavy one.
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(width).toBe(1024);
    await vi.waitFor(() => expect(workers()).toEqual([]), { timeout: 5000 }); // No drawing process of ours is left alive.
  }, 30_000);
});
