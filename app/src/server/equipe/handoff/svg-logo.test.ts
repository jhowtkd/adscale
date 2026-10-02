import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SVG_RENDER_TIMEOUT_MS, SvgLogoError, rasterizeSvgLogo, type SvgRejection } from "./svg-logo";
import { MAX_SVG_BYTES, SVG_LOGO_LONG_SIDE_PX } from "./svg-sanitize";

// `sharp` is the real one, except that a PNG encode can be made slow (and is counted), to prove the deadline, the queue and the abort without a file that is really heavy.
const probe = vi.hoisted(() => ({ delayMs: 0, renders: 0, inFlight: 0, maxInFlight: 0, fail: null as Error | null }));
vi.mock("sharp", async importOriginal => {
  const real = (await importOriginal<typeof import("sharp")>()).default;
  const wrapped = (...args: Parameters<typeof real>) => {
    const instance = real(...args);
    const png = instance.png.bind(instance);
    instance.png = ((...options: Parameters<typeof instance.png>) => {
      const piped = png(...options);
      const toBuffer = piped.toBuffer.bind(piped);
      piped.toBuffer = (async (...rest: unknown[]) => {
        probe.renders++; probe.inFlight++; probe.maxInFlight = Math.max(probe.maxInFlight, probe.inFlight);
        try {
          if (probe.fail) throw probe.fail;
          if (probe.delayMs) await new Promise(resolve => setTimeout(resolve, probe.delayMs));
          return await (toBuffer as (...a: unknown[]) => Promise<unknown>)(...rest);
        } finally { probe.inFlight--; }
      }) as typeof piped.toBuffer;
      return piped;
    }) as typeof instance.png;
    return instance;
  };
  return { default: Object.assign(wrapped, real) };
});

beforeEach(() => { probe.fail = null; });

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
  beforeEach(() => { probe.delayMs = 0; });

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
  beforeEach(() => { probe.delayMs = 0; });

  it("rejects what the sanitizer rejects, with its code, before anything is drawn", async () => {
    probe.renders = 0;
    expect(await codeOf(Buffer.alloc(MAX_SVG_BYTES + 1))).toBe("svg_too_large");
    expect(await codeOf("")).toBe("svg_malformed");
    expect(await codeOf(`<svg ${NS} width="10" height="10"><g>`)).toBe("svg_malformed");
    expect(await codeOf(`<svg ${NS}><rect width="1" height="1"/></svg>`)).toBe("svg_unsupported");
    expect(await codeOf(`<svg ${NS} viewBox="0 0 1 100000"><rect width="1" height="100000"/></svg>`)).toBe("svg_unsupported");
    expect(await codeOf(`<svg ${NS} viewBox="0 0 10 10">${"<g>".repeat(200)}</svg>`)).toBe("svg_too_complex");
    expect(probe.renders).toBe(0);
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

  it("a render that fails inside the renderer becomes svg_render_failed, never the renderer's own error or its words", async () => {
    probe.fail = new Error("vips: unable to open /srv/secret/logo.svg SECRET-TOKEN-4711");
    const error = await rasterizeSvgLogo(bytes(SIMPLE)).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(SvgLogoError);
    expect(error).toMatchObject({ code: "svg_render_failed", message: "svg_render_failed" });
    expect(String((error as Error).stack)).not.toContain("SECRET-TOKEN-4711");
    probe.fail = null;
    expect((await rasterizeSvgLogo(bytes(SIMPLE))).png.length).toBeGreaterThan(0); // The failure did not leave the queue stuck.
  });

  it("finishes fast on cycles of gradients, masks, clip paths and references to themselves", async () => {
    const cycles = [
      `<svg ${NS} ${XLINK} viewBox="0 0 10 10"><defs><linearGradient id="a" xlink:href="#b"/><linearGradient id="b" xlink:href="#a"/></defs><rect width="10" height="10" fill="url(#a)"/></svg>`,
      `<svg ${NS} viewBox="0 0 10 10"><defs><mask id="m" mask="url(#m)"><rect width="10" height="10" fill="#fff" mask="url(#m)"/></mask></defs><rect width="10" height="10" fill="red" mask="url(#m)"/></svg>`,
      `<svg ${NS} viewBox="0 0 10 10"><defs><clipPath id="c" clip-path="url(#c)"><rect width="5" height="5"/></clipPath></defs><rect width="10" height="10" fill="red" clip-path="url(#c)"/></svg>`,
      `<svg ${NS} ${XLINK} viewBox="0 0 10 10"><defs><g id="a"><use href="#a"/></g><symbol id="s"><use href="#s"/><rect width="1" height="1"/></symbol></defs><use href="#a"/><use href="#s"/><rect width="5" height="5"/></svg>`,
      `<svg ${NS} ${XLINK} viewBox="0 0 10 10"><defs><linearGradient id="a" xlink:href="#a"/></defs><rect width="10" height="10" fill="url(#a)"/></svg>`,
    ];
    for (const input of cycles) {
      const started = performance.now();
      const code = await codeOf(input);
      expect(["ok", "svg_empty", "svg_render_failed", "svg_unsupported"], input).toContain(code);
      expect(performance.now() - started, input).toBeLessThan(2000);
    }
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
    const { png } = await rasterizeSvgLogo(bytes(`<svg ${NS} viewBox="0 0 10 10"><defs>${group}</defs>${'<use href="#big"/>'.repeat(5)}</svg>`));
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
  beforeEach(() => { probe.delayMs = 0; hits.length = 0; });

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

describe("rasterizeSvgLogo: signal, deadline and queue", () => {
  // `inFlight` is never reset: a draw that outlives its test (a deadline does not stop it) still ends and counts itself out.
  beforeEach(() => { probe.delayMs = 0; probe.renders = 0; probe.maxInFlight = 0; });

  it("rejects with the signal's reason when it is already aborted, and draws nothing", async () => {
    const reason = new Error("stopped by the reading");
    await expect(rasterizeSvgLogo(bytes(SIMPLE), { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    await expect(rasterizeSvgLogo(bytes(SIMPLE), { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(probe.renders).toBe(0);
  });

  it("an aborted signal does not hide that the file is bad: the sanitizer answers first", async () => {
    await expect(rasterizeSvgLogo(bytes(""), { signal: AbortSignal.abort(new Error("late")) })).rejects.toMatchObject({ code: "svg_malformed" });
  });

  // The slow draw is 1 s and the abort / deadline 30-50 ms: whether the call gave up without waiting for the draw is read from the draw still being in flight, not from
  // a stopwatch, so a busy machine cannot make these two flaky.
  it("rejects with the signal's reason when it is aborted while drawing", async () => {
    probe.delayMs = 1000;
    const controller = new AbortController();
    const running = rasterizeSvgLogo(bytes(SIMPLE), { signal: controller.signal });
    setTimeout(() => controller.abort(new Error("gone")), 30);
    await expect(running).rejects.toThrow("gone");
    expect(probe.inFlight).toBe(1); // It did not wait for the draw.
    await sleep(1100); // The slow draw ends by itself, and frees the place for the next one.
    expect(probe.inFlight).toBe(0);
  });

  it("gives up with svg_timeout when drawing takes longer than the deadline", async () => {
    probe.delayMs = 1000;
    const error = await rasterizeSvgLogo(bytes(SIMPLE), { timeoutMs: 50 }).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(SvgLogoError);
    expect((error as SvgLogoError).code).toBe("svg_timeout");
    expect((error as SvgLogoError).message).toBe("svg_timeout");
    expect(probe.inFlight).toBe(1); // It did not wait for the draw.
    await sleep(1100);
    expect(probe.inFlight).toBe(0);
  });

  it("the default deadline is 8 seconds", () => {
    expect(SVG_RENDER_TIMEOUT_MS).toBe(8000);
  });

  it("a heavy file with a short deadline either finishes or answers svg_timeout: it never hangs", async () => {
    const heavy = `<svg ${NS} viewBox="0 0 1000 1000">${Array.from({ length: 3000 }, (_, i) => `<path d="M${i % 1000} 0 C ${(i * 7) % 1000} 500 ${(i * 13) % 1000} 700 ${(i * 3) % 1000} 1000" stroke="#${(i * 977 % 0xffffff).toString(16).padStart(6, "0")}" stroke-width="3" fill="none"/>`).join("")}</svg>`;
    const started = performance.now();
    const code = await codeOf(heavy, { timeoutMs: 5 });
    expect(["ok", "svg_timeout"]).toContain(code);
    expect(performance.now() - started).toBeLessThan(3000);
    await rasterizeSvgLogo(bytes(SIMPLE)); // One at a time: when this one is done, the heavy draw behind the deadline is done too.
  });

  it("two calls at once both finish, one at a time", async () => {
    probe.delayMs = 100;
    const [a, b] = await Promise.all([rasterizeSvgLogo(bytes(SIMPLE)), rasterizeSvgLogo(bytes(ILLUSTRATOR))]);
    expect(a.png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(b.png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(probe.renders).toBe(2);
    expect(probe.maxInFlight).toBe(1);
  });

  it("a call that waited its turn past its own deadline answers svg_timeout and never draws", async () => {
    probe.delayMs = 250;
    const first = rasterizeSvgLogo(bytes(SIMPLE));
    const second = rasterizeSvgLogo(bytes(ILLUSTRATOR), { timeoutMs: 40 });
    await expect(second).rejects.toMatchObject({ code: "svg_timeout" });
    await first;
    await sleep(50); // Its turn has come by now.
    expect(probe.renders).toBe(1);
  });

  it("one call that fails does not stop the ones behind it", async () => {
    const results = await Promise.allSettled([
      rasterizeSvgLogo(bytes(`<svg ${NS} width="10" height="10"><script/></svg>`)),
      rasterizeSvgLogo(bytes(SIMPLE)),
      rasterizeSvgLogo(bytes("not an svg")),
      rasterizeSvgLogo(bytes(ILLUSTRATOR)),
    ]);
    expect(results.map(result => result.status)).toEqual(["rejected", "fulfilled", "rejected", "fulfilled"]);
  });
});
