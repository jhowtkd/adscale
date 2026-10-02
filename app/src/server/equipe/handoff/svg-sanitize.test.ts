import { describe, expect, it } from "vitest";
import { MAX_SVG_BYTES, SVG_LOGO_LONG_SIDE_PX, SvgLogoError, looksLikeSvg, sanitizeSvg, type SvgRejection } from "./svg-sanitize";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const bytes = (text: string) => Buffer.from(text, "utf8");
const svgOf = (body: string, attrs = 'width="100" height="100"') => `<svg ${NS} ${XLINK} ${attrs}>${body}</svg>`;

function codeOf(input: string | Uint8Array): SvgRejection | "ok" {
  try { sanitizeSvg(typeof input === "string" ? bytes(input) : input); return "ok"; }
  catch (error) {
    if (!(error instanceof SvgLogoError)) throw error;
    return error.code;
  }
}

/** What the clean SVG must never carry, whatever the input said. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ["script", /<script/i], ["foreignObject", /foreignObject/i], ["image", /<image/i], ["doctype", /<!DOCTYPE/i], ["entity", /<!ENTITY/i],
  ["@import", /@import/i], ["@font-face", /@font-face/i], ["event handler", /\son[a-z]+\s*=/i], ["javascript:", /javascript:/i], ["file:", /file:/i],
  ["filter", /filter/i], ["dasharray", /stroke-dasharray/i], ["pattern", /pattern/i], ["animation", /<(?:animate|set)/i], ["processing instruction", /<\?/],
];
const ALLOWED_URLS = ["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"];
function expectClean(svg: string) {
  for (const [name, pattern] of FORBIDDEN) expect(pattern.test(svg), `output carries ${name}`).toBe(false);
  for (const url of svg.match(/https?:\/\/[^\s"'<>)]+/gi) ?? []) expect(ALLOWED_URLS, `output carries ${url}`).toContain(url);
}
const ALLOWED_TAGS = new Set(["svg", "g", "defs", "symbol", "use", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "text", "tspan", "textPath", "style",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const tagsOf = (svg: string) => [...svg.matchAll(/<\/?([A-Za-z][\w:.-]*)/g)].map(match => match[1]!);

const ILLUSTRATOR = `<?xml version="1.0" encoding="utf-8"?><!-- Generator: Adobe Illustrator 26 --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/"><!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">]><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:x="&ns_extend;" xmlns:i="&ns_ai;" x="0px" y="0px" viewBox="0 0 200 100" style="enable-background:new 0 0 200 100;" xml:space="preserve"><style type="text/css">.st0{fill:#E4002B;}.st1{fill:none;stroke:#231F20;stroke-width:4;stroke-miterlimit:10;}@media (prefers-color-scheme: dark){.st0{fill:#fff}}</style><switch><foreignObject requiredExtensions="&ns_ai;" x="0" y="0" width="1" height="1"/><g i:extraneous="self"><circle class="st0" cx="50" cy="50" r="40"/><rect class="st1" x="100" y="20" width="80" height="60"/></g></switch></svg>`;
const INKSCAPE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><svg xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="210mm" height="297mm" viewBox="0 0 210 297" version="1.1" id="svg8" inkscape:version="1.0"><defs id="defs2"><linearGradient id="g1"><stop offset="0" style="stop-color:#ff0000;stop-opacity:1"/><stop offset="1" style="stop-color:#0000ff;stop-opacity:1"/></linearGradient></defs><sodipodi:namedview id="base" pagecolor="#ffffff"/><metadata id="metadata5"><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format></cc:Work></rdf:RDF></metadata><g inkscape:label="Layer 1" id="layer1"><rect style="fill:url(#g1);stroke:none" id="rect10" width="100" height="100" x="10" y="10"/></g></svg>`;
const WORDMARK = `<svg ${NS} width="200" height="50" viewBox="0 0 200 50"><text x="0" y="35" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#111">ACME</text></svg>`;

describe("looksLikeSvg", () => {
  it("recognizes an SVG by its first bytes, with or without a prolog, in any case", () => {
    expect(looksLikeSvg(bytes(svgOf("")))).toBe(true);
    expect(looksLikeSvg(bytes(`<?xml version="1.0"?>\n<!-- made by hand -->\n<svg ${NS}/>`))).toBe(true);
    expect(looksLikeSvg(bytes("<SVG>"))).toBe(true);
    expect(looksLikeSvg(bytes("<svg\n  width='1'/>"))).toBe(true);
  });

  it("does not take other documents or other tags for an SVG", () => {
    expect(looksLikeSvg(bytes("<html><body>hi</body></html>"))).toBe(false);
    expect(looksLikeSvg(bytes("<svgfoo></svgfoo>"))).toBe(false);
    expect(looksLikeSvg(bytes("plain text"))).toBe(false);
    expect(looksLikeSvg(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe(false);
    expect(looksLikeSvg(new Uint8Array())).toBe(false);
  });

  it("reads only the first 4 KiB", () => {
    expect(looksLikeSvg(bytes(`${" ".repeat(5000)}<svg>`))).toBe(false);
    expect(looksLikeSvg(bytes(`${" ".repeat(4000)}<svg>`))).toBe(true);
  });
});

describe("sanitizeSvg: legitimate logos", () => {
  it("keeps plain shapes and declares the namespaces and the size itself", () => {
    const result = sanitizeSvg(bytes(`<svg ${NS} viewBox="0 0 240 80"><circle cx="40" cy="40" r="32" fill="#c9573a"/><rect x="86" y="25" width="132" height="11" rx="5.5" fill="#2b1a10"/></svg>`));
    expect(result.svg).toContain('<circle cx="40" cy="40" r="32" fill="#c9573a"/>');
    expect(result.svg).toContain('rx="5.5"');
    expect(result.svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="341" viewBox="0 0 240 80"`)).toBe(true);
    expect({ width: result.width, height: result.height }).toEqual({ width: 1024, height: 341 });
    expectClean(result.svg);
  });

  it("reads an Illustrator file: the DOCTYPE and its entities are skipped, the style is kept, @media and the switch/foreignObject are not", () => {
    const { svg, width, height } = sanitizeSvg(bytes(ILLUSTRATOR));
    expect(svg).toContain(".st0{fill:#E4002B}");
    expect(svg).toContain(".st1{fill:none;stroke:#231F20;stroke-width:4;stroke-miterlimit:10}");
    expect(svg).not.toContain("prefers-color-scheme");
    expect(svg).not.toContain("switch");
    expect(svg).toContain('<circle class="st0" cx="50" cy="50" r="40"/>');
    expect(svg).toContain('<rect class="st1"');
    expect(svg).not.toContain("&ns_");
    expect(svg).not.toMatch(/xmlns:[xi]=/);
    expect({ width, height }).toEqual({ width: 1024, height: 512 });
    expectClean(svg);
  });

  it("reads an Inkscape file: its own attributes, metadata and named views are dropped, the gradient is kept", () => {
    const { svg, width, height } = sanitizeSvg(bytes(INKSCAPE));
    for (const word of ["inkscape", "sodipodi", "metadata", "rdf", "namedview", "purl.org", "creativecommons"]) expect(svg).not.toContain(word);
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('<stop offset="0" style="stop-color:#ff0000;stop-opacity:1"/>');
    expect(svg).toContain('style="fill:url(#g1);stroke:none"');
    // 210mm x 297mm: the longest side is the height.
    expect({ width, height }).toEqual({ width: 724, height: 1024 });
    expectClean(svg);
  });

  it("keeps simple text and escapes it again", () => {
    const { svg } = sanitizeSvg(bytes(WORDMARK));
    expect(svg).toContain('font-family="Arial, sans-serif"');
    expect(svg).toContain(">ACME</text>");
    const entities = sanitizeSvg(bytes(`<svg ${NS} width="200" height="40"><text x="0" y="30" font-size="20">A&#38;B &amp; C&#x41; &lt;i&gt;</text></svg>`)).svg;
    expect(entities).toContain(">A&amp;B &amp; CA &lt;i&gt;</text>");
  });

  it("takes the size from the viewBox when width/height are missing, and from width/height with units when both are there", () => {
    expect(sanitizeSvg(bytes(`<svg ${NS} viewBox="0 0 50 100"><rect width="1" height="1"/></svg>`))).toMatchObject({ width: 512, height: 1024 });
    expect(sanitizeSvg(bytes(`<svg ${NS} width="1in" height="0.5in"><rect width="1" height="1"/></svg>`))).toMatchObject({ width: 1024, height: 512 });
    // The viewBox decides what is drawn; width/height only decide the shape of the frame.
    expect(sanitizeSvg(bytes(`<svg ${NS} width="300" height="100" viewBox="10 20 30 40"><rect width="1" height="1"/></svg>`)).svg).toContain('viewBox="10 20 30 40"');
  });

  it("is not tied to a namespace declaration: none at all, or an entity (old Illustrator) is accepted", () => {
    expect(codeOf(`<svg width="10" height="10"><rect width="5" height="5"/></svg>`)).toBe("ok");
    expect(codeOf(ILLUSTRATOR)).toBe("ok");
  });

  it("always writes the longest side as 1024, whatever the file declares", () => {
    for (const attrs of ['width="100000" height="100000"', 'width="3" height="3"', 'viewBox="0 0 1000000 1000000"', 'width="10" height="10" viewBox="0 0 1000000 1000000"']) {
      const result = sanitizeSvg(bytes(svgOf('<rect width="5" height="5"/>', attrs)));
      expect(Math.max(result.width, result.height), attrs).toBe(SVG_LOGO_LONG_SIDE_PX);
      expect(result.svg, attrs).toContain('width="1024" height="1024"');
      expect(result.svg).not.toMatch(/ (?:width|height)="(?!1024")[0-9]{4,}"/); // The declared size never reaches the output; only the viewBox (a coordinate space) may be large.
    }
  });
});

describe("sanitizeSvg: hostile input is rejected, or cleaned to something that does nothing", () => {
  const cleaned: Array<[string, string, string[]]> = [
    ["a script and event handlers", `<svg ${NS} width="100" height="100" onload="alert(1)"><script>alert(document.cookie)</script><rect width="100" height="100" fill="green" onclick="x()"/></svg>`, ['fill="green"']],
    ["foreignObject with an <img> from the network", `<svg ${NS} width="100" height="100"><foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><img src="http://127.0.0.1:9/f.png"/></div></foreignObject><rect width="10" height="10" fill="green"/></svg>`, ['fill="green"']],
    ["<image> by http, file and data", svgOf(`<image href="http://127.0.0.1:9/x.png" width="100" height="100"/><image xlink:href="file:///etc/passwd" width="10" height="10"/><image href="data:image/png;base64,iVBORw0KGgo="/><rect width="10" height="10" fill="green"/>`), ['fill="green"']],
    ["<use> pointing outside the document", svgOf(`<use xlink:href="http://127.0.0.1:9/e.svg#a"/><use href="file:///etc/passwd#a"/><use href="data:image/svg+xml,&lt;svg/&gt;"/><rect width="10" height="10" fill="green"/>`), ['fill="green"']],
    ["external hrefs on gradients and text paths (any element that may carry one)", svgOf(`<defs><linearGradient id="g" xlink:href="http://127.0.0.1:9/g.svg#a"/><radialGradient id="r" href="file:///etc/passwd#a"/></defs><text x="0" y="9"><textPath href="http://127.0.0.1:9/p.svg#p">hi</textPath><tspan xlink:href="javascript:alert(1)">x</tspan></text><rect width="10" height="10" fill="url(#g)" stroke="green"/>`), ['stroke="green"']],
    ["CSS that loads things, in <style> and in style=", svgOf(`<style>@import url(http://127.0.0.1:9/a.css); @font-face{font-family:x;src:url(http://127.0.0.1:9/f.woff)} rect{fill:url(http://127.0.0.1:9/b)} circle{fill:blue}</style><rect width="50" height="100" style="fill:url(http://127.0.0.1:9/c);stroke:red"/><circle cx="75" cy="50" r="20"/>`), ["circle{fill:blue}", 'style="stroke:red"']],
    ["an external DTD", `<?xml version="1.0"?><!DOCTYPE svg SYSTEM "http://127.0.0.1:9/evil.dtd"><svg ${NS} width="30" height="30"><rect width="30" height="30" fill="green"/></svg>`, ['fill="green"']],
    ["an internal subset with an external entity that is never used", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd"> <!-- > --> <!ENTITY a "]>">]><svg ${NS} width="30" height="30"><rect width="30" height="30" fill="green"/></svg>`, ['fill="green"']],
    ["links, animations and sets", `<svg ${NS} width="100" height="100"><a href="javascript:alert(1)"><rect width="10" height="10" fill="green"><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="onclick" to="x()"/></rect></a></svg>`, ['fill="green"']],
    ["filters, patterns, dashes and markers", svgOf(`<filter id="f"><feGaussianBlur stdDeviation="100000"/></filter><pattern id="p" width="0.0001" height="0.0001"><rect width="1" height="1"/></pattern><path d="M0 0L100000 100000" stroke="red" stroke-width="1" stroke-dasharray="0.00001" marker-end="url(#m)" filter="url(#f)"/><rect width="50" height="50" fill="url(#p)" style="filter:url(#f);stroke-dasharray:0.00001"/><circle cx="5" cy="5" r="2" fill="blue"/>`), ['fill="blue"']],
    ["names that exist on every object", svgOf(`<rect __proto__="x" constructor="y" toString="z" hasOwnProperty="1" width="5" height="5" style="constructor:red;__proto__:red;toString:red;fill:green"/>`), ['style="fill:green"']],
    ["processing instructions, CDATA and comments around the content", `<?xml-stylesheet href="http://127.0.0.1:9/a.xsl"?><!-- hi --><svg ${NS} width="10" height="10"><!-- hi --><style><![CDATA[rect{fill:green}]]></style><rect width="5" height="5"/><![CDATA[stray]]></svg><!-- bye -->`, ["rect{fill:green}"]],
    ["declarations that are not plain values", svgOf(`<style>rect{fill:expression(alert(1));stroke:url("javascript:alert(1)");color:red}</style><rect width="5" height="5" fill="url(http://x/y)" stroke="url(#ok)" opacity="1e999999" mask="url(file:///x)"/>`), ["rect{color:red}", 'stroke="url(#ok)"']],
  ];
  it.each(cleaned)("%s", (_name, input, expected) => {
    const { svg } = sanitizeSvg(bytes(input));
    expectClean(svg);
    for (const text of expected) expect(svg).toContain(text);
  });

  it("drops a <use> that points outside the document, so none is left", () => {
    expect(sanitizeSvg(bytes(svgOf(`<use xlink:href="http://127.0.0.1:9/e.svg#a"/><use href="file:///etc/passwd#a"/>`))).svg).not.toContain("<use");
  });

  const rejected: Array<[string, string | Uint8Array, SvgRejection]> = [
    ["a CSS escape that spells @import", svgOf(`<style>@\\69mport url(http://127.0.0.1:9/a.css);</style><rect width="5" height="5"/>`), "svg_unsupported"],
    ["a CSS escape in a declaration", svgOf(`<style>rect{fi\\6c l:red}</style><rect width="5" height="5"/>`), "svg_unsupported"],
    ["an external entity (file) used in the text", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg ${NS} width="300" height="60"><text x="0" y="30">&xxe;</text></svg>`, "svg_malformed"],
    ["an external entity (http) used in the text", `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "http://127.0.0.1:9/e">]><svg ${NS} width="300" height="60"><text x="0" y="30">&xxe;</text></svg>`, "svg_malformed"],
    ["an entity used in an attribute", `<!DOCTYPE svg [<!ENTITY c "red">]><svg ${NS} width="30" height="30"><rect width="30" height="30" fill="&c;"/></svg>`, "svg_malformed"],
    ["an undeclared entity", svgOf(`<text x="0" y="30">&nbsp;</text>`), "svg_malformed"],
    ["a bare ampersand", svgOf(`<text x="0" y="30">AT&T</text>`), "svg_malformed"],
    ["numeric reference to NUL", svgOf(`<text x="0" y="30">&#0;</text>`), "svg_malformed"],
    ["numeric reference to a surrogate", svgOf(`<text x="0" y="30">&#xD800;</text>`), "svg_malformed"],
    ["numeric reference past U+10FFFF", svgOf(`<text x="0" y="30">&#1114112;</text>`), "svg_malformed"],
    ["an absurd rotation of nothing: a sliver", `<svg ${NS} viewBox="0 0 1 100000"><rect width="1" height="100000" fill="red"/></svg>`, "svg_unsupported"],
    ["a very wide banner", `<svg ${NS} viewBox="0 0 100000 1"><rect width="100000" height="1" fill="red"/></svg>`, "svg_unsupported"],
    ["no size at all", `<svg ${NS}><rect width="10" height="10"/></svg>`, "svg_unsupported"],
    ["a size in percent", `<svg ${NS} width="100%" height="100%"><rect width="10" height="10"/></svg>`, "svg_unsupported"],
    ["a zero size", `<svg ${NS} width="0" height="0"><rect width="10" height="10"/></svg>`, "svg_unsupported"],
    ["a viewBox with no area", `<svg ${NS} viewBox="0 0 0 0"><rect width="10" height="10"/></svg>`, "svg_unsupported"],
    ["a root that is not an svg", `<html ${NS.replace("2000/svg", "1999/xhtml")}><body>hi</body></html>`, "svg_unsupported"],
    ["an svg root in the XHTML namespace", `<svg xmlns="http://www.w3.org/1999/xhtml" width="10" height="10"><rect width="5" height="5"/></svg>`, "svg_unsupported"],
    ["an svg root in another namespace", `<svg xmlns="http://example.com/evil" width="10" height="10"><rect width="5" height="5"/></svg>`, "svg_unsupported"],
  ];
  it.each(rejected)("rejects %s", (_name, input, code) => {
    expect(codeOf(input)).toBe(code);
  });
});

describe("sanitizeSvg: files that are not well formed", () => {
  const malformed: Array<[string, string | Uint8Array]> = [
    ["empty", ""],
    ["only spaces", "   \n  "],
    ["an unclosed tag", `<svg ${NS} width="10" height="10"><rect width="5" height="5">`],
    ["a swapped closing tag", `<svg ${NS} width="10" height="10"><g><rect width="5" height="5"/></svg></g>`],
    ["two roots", `<svg ${NS} width="10" height="10"/><svg ${NS} width="10" height="10"/>`],
    ["text outside the root", `hello<svg ${NS} width="10" height="10"/>`],
    ["text after the root", `<svg ${NS} width="10" height="10"/>hello`],
    ["garbage", "this is not xml at all <svg"],
    ["a cut <svg", `<svg ${NS} wid`],
    ["a cut in a value", `<svg ${NS} width="10`],
    ["an attribute with no quotes", `<svg ${NS} width="10" height="10"><rect width=5 height=5/></svg>`],
    ["an attribute with no value", `<svg ${NS} width="10" height="10"><rect hidden/></svg>`],
    ["a repeated attribute", `<svg ${NS} width="10" height="10"><rect width="5" width="6"/></svg>`],
    ["a < inside an attribute value", `<svg ${NS} width="10" height="10"><rect width="5<"/></svg>`],
    ["an unclosed comment", `<svg ${NS} width="10" height="10"><!-- never closed</svg>`],
    ["an unclosed CDATA", `<svg ${NS} width="10" height="10"><style><![CDATA[ rect{} </style></svg>`],
    ["a CDATA outside the root", `<![CDATA[x]]><svg ${NS} width="10" height="10"/>`],
    ["a stray declaration inside the root", `<svg ${NS} width="10" height="10"><!ELEMENT x></svg>`],
    ["an unclosed processing instruction", `<?xml version="1.0"<svg ${NS} width="10" height="10"/>`],
    ["an unclosed DOCTYPE", `<!DOCTYPE svg [<!ENTITY a "b">`],
    ["an unterminated quote in the DOCTYPE", `<!DOCTYPE svg SYSTEM "x><svg ${NS} width="10" height="10"/>`],
    ["a tag name that is not a name", `<svg ${NS} width="10" height="10"><1/></svg>`],
    ["a closing tag with an attribute", `<svg ${NS} width="10" height="10"></svg x="1">`],
    ["a NUL byte", `<svg ${NS} width="10" height="10">\u0000</svg>`],
    ["a control character", `<svg ${NS} width="10" height="10">\u0007</svg>`],
    ["UTF-16 with a byte order mark", Buffer.from(`﻿<svg ${NS} width='10' height='10'><rect width='5' height='5'/></svg>`, "utf16le")],
    ["UTF-16 without one", Buffer.from(`<svg ${NS} width='10' height='10'><rect width='5' height='5'/></svg>`, "utf16le")],
    ["bytes that are not UTF-8", Buffer.from([0x3c, 0x73, 0x76, 0x67, 0xff, 0xfe, 0x3e])],
    ["a PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])],
  ];
  it.each(malformed)("rejects %s as malformed", (_name, input) => {
    expect(codeOf(input)).toBe("svg_malformed");
  });

  it("rejects more than the limit of attributes on an element", () => {
    const attrs = (count: number) => Array.from({ length: count }, (_, i) => `a${i}="1"`).join(" ");
    expect(codeOf(`<svg ${NS} width="10" height="10"><rect ${attrs(190)}/></svg>`)).toBe("ok");
    expect(codeOf(`<svg ${NS} width="10" height="10"><rect ${attrs(250)}/></svg>`)).toBe("svg_malformed");
  });
});

describe("sanitizeSvg: limits", () => {
  it("rejects a file past MAX_SVG_BYTES as too large, without reading it", () => {
    // Zeros would be "malformed" (control characters): it is the size that is answered, before any reading.
    expect(codeOf(Buffer.alloc(MAX_SVG_BYTES + 1))).toBe("svg_too_large");
    expect(codeOf(Buffer.alloc(MAX_SVG_BYTES))).toBe("svg_malformed");
  });

  it("does not take a document of exactly MAX_SVG_BYTES for too large", () => {
    const head = `<svg ${NS} width="10" height="10"><desc>`, tail = "</desc></svg>";
    const padded = `${head}${"a".repeat(MAX_SVG_BYTES - head.length - tail.length)}${tail}`;
    expect(padded.length).toBe(MAX_SVG_BYTES);
    expect(codeOf(padded)).toBe("ok");
    expect(codeOf(`${padded} `)).toBe("svg_too_large");
  });

  it("rejects nesting that is too deep, and takes a reasonable depth", () => {
    const nested = (depth: number) => `<svg ${NS} viewBox="0 0 10 10">${"<g>".repeat(depth)}<rect width="5" height="5"/>${"</g>".repeat(depth)}</svg>`;
    expect(codeOf(nested(40))).toBe("ok");
    expect(codeOf(nested(200))).toBe("svg_too_complex");
  });

  it("rejects too many elements, and takes a few thousand", () => {
    const many = (count: number) => `<svg ${NS} viewBox="0 0 10 10">${"<rect width='1' height='1'/>".repeat(count)}</svg>`;
    expect(codeOf(many(3000))).toBe("ok");
    expect(codeOf(many(20_000))).toBe("svg_too_complex");
  });

  it("rejects more than the limit of <text> elements", () => {
    const texts = (count: number) => svgOf("<text x='0' y='9'>a</text>".repeat(count));
    expect(codeOf(texts(100))).toBe("ok");
    expect(codeOf(texts(201))).toBe("svg_too_complex");
  });

  it("rejects more references than the limit", () => {
    const references = (count: number) => svgOf(`<defs><linearGradient id="g"/></defs>${'<rect width="1" height="1" fill="url(#g)"/>'.repeat(count)}`);
    expect(codeOf(references(900))).toBe("ok");
    expect(codeOf(references(1100))).toBe("svg_too_complex");
  });
});

describe("sanitizeSvg: <use>", () => {
  const chain = svgOf(`<defs><rect id="a" width="1" height="1"/><g id="b"><use xlink:href="#a"/><use xlink:href="#a"/></g><g id="c"><use xlink:href="#b"/><use xlink:href="#b"/></g></defs><use xlink:href="#c"/><use xlink:href="#a" fill="red"/>`, 'viewBox="0 0 10 10"');

  it("prunes a chain: only a <use> whose target holds no <use> stays", () => {
    const { svg } = sanitizeSvg(bytes(chain));
    const targets = [...svg.matchAll(/<use [^>]*href="#([^"]+)"/g)].map(match => match[1]);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set(["a"]));
    expect(svg).not.toContain('href="#b"');
    expect(svg).not.toContain('href="#c"');
    expect(svg).toContain('fill="red"');
  });

  it("drops a <use> that points to a missing id, to itself, or to an ancestor", () => {
    const cases = [
      svgOf(`<use href="#nowhere"/><rect width="1" height="1"/>`),
      svgOf(`<use id="u" href="#u"/><rect width="1" height="1"/>`),
      svgOf(`<g id="g"><use href="#g"/><rect width="1" height="1"/></g>`),
      svgOf(`<g id="x"><use href="#y"/></g><g id="y"><use href="#x"/></g><rect width="1" height="1"/>`),
    ];
    for (const input of cases) expect(sanitizeSvg(bytes(input)).svg).not.toContain("<use");
  });

  it("keeps a <use> of something with no <use> in it, as many times as the budget allows", () => {
    const { svg } = sanitizeSvg(bytes(svgOf(`<defs><g id="a"><rect width="1" height="1"/></g></defs>${'<use href="#a"/>'.repeat(50)}`)));
    expect(svg.match(/<use /g)).toHaveLength(50);
  });

  it("stops what <use> brings in at a budget: a group with thousands of children used a few times is too complex", () => {
    const group = `<g id="big">${"<rect width='1' height='1'/>".repeat(5000)}</g>`;
    expect(codeOf(svgOf(`<defs>${group}</defs>${'<use href="#big"/>'.repeat(3)}`, 'viewBox="0 0 10 10"'))).toBe("ok");
    expect(codeOf(svgOf(`<defs>${group}</defs>${'<use href="#big"/>'.repeat(5)}`, 'viewBox="0 0 10 10"'))).toBe("svg_too_complex");
  });
});

describe("sanitizeSvg: properties", () => {
  /** A small seeded generator (mulberry32): the same cases on every run. */
  function random(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const BASE = Buffer.from(`<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY e "x">]><svg ${NS} ${XLINK} width="240" height="80" viewBox="0 0 240 80"><style>.a{fill:#c9573a;stroke-width:2}.b{fill:url(#g)}</style><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f" style="stop-opacity:.5"/></linearGradient><g id="s"><circle cx="5" cy="5" r="4"/></g><clipPath id="c"><rect width="50" height="50"/></clipPath></defs><g transform="translate(10 10) scale(2)" clip-path="url(#c)"><use xlink:href="#s" class="a"/><path class="b" d="M0 0 L10 0 L10 10 Z" fill-rule="evenodd"/></g><text x="86" y="40" font-family="Arial, sans-serif" font-size="20" fill="#111">AC&amp;ME<tspan dx="3">!</tspan></text><polygon points="0,0 4,0 4,4"/><script>alert(1)</script><image href="http://x/y.png"/></svg>`);

  function mutate(rand: () => number): Buffer {
    const at = Math.floor(rand() * BASE.length);
    switch (Math.floor(rand() * 4)) {
      case 0: return BASE.subarray(0, at);
      case 1: { const copy = Buffer.from(BASE); copy[at] = Math.floor(rand() * 256); return copy; }
      case 2: return Buffer.concat([BASE.subarray(0, at), BASE.subarray(at + 1)]);
      default: { const length = 1 + Math.floor(rand() * 40); return Buffer.concat([BASE.subarray(0, at), BASE.subarray(at, at + length), BASE.subarray(at)]); }
    }
  }

  it("the base file is itself readable (so the mutations start from a logo)", () => {
    const { svg } = sanitizeSvg(BASE);
    expectClean(svg);
    expect(svg).toContain("<text");
  });

  it("only ever throws SvgLogoError; what it returns uses allow-listed tags, carries nothing dangerous, and sanitizing it again changes nothing", () => {
    const rand = random(20260502);
    let accepted = 0, rejectedCount = 0;
    for (let i = 0; i < 500; i++) {
      const input = mutate(rand);
      let result: ReturnType<typeof sanitizeSvg>;
      try { result = sanitizeSvg(input); }
      catch (error) {
        expect(error, `case ${i}`).toBeInstanceOf(SvgLogoError);
        rejectedCount++;
        continue;
      }
      accepted++;
      for (const tag of tagsOf(result.svg)) expect(ALLOWED_TAGS.has(tag), `case ${i}: <${tag}>`).toBe(true);
      expectClean(result.svg);
      expect(Math.max(result.width, result.height), `case ${i}`).toBe(SVG_LOGO_LONG_SIDE_PX);
      expect(sanitizeSvg(bytes(result.svg)).svg, `case ${i}: not idempotent`).toBe(result.svg);
    }
    // The cut-off ones are rejected and the others (a changed byte inside a value, a duplicated piece) mostly survive: both paths are exercised.
    expect(accepted).toBeGreaterThan(20);
    expect(rejectedCount).toBeGreaterThan(20);
  });

  it("truncating the file at every position gives an SvgLogoError or a clean SVG, never another error", () => {
    for (let at = 0; at < BASE.length; at += 3) {
      try { expectClean(sanitizeSvg(BASE.subarray(0, at)).svg); }
      catch (error) { expect(error, `cut at ${at}`).toBeInstanceOf(SvgLogoError); }
    }
  });
});

describe("sanitizeSvg: time", () => {
  const BUDGET_MS = 1500;
  const timed = (name: string, input: string) => {
    const started = performance.now();
    try { sanitizeSvg(bytes(input)); } catch (error) { expect(error, name).toBeInstanceOf(SvgLogoError); }
    expect(performance.now() - started, name).toBeLessThan(BUDGET_MS);
  };
  const attrs = (count: number) => Array.from({ length: count }, (_, i) => `a${i}="1"`).join(" ");

  it.each<[string, string]>([
    ["200 thousand spaces in style=", svgOf(`<rect width="1" height="1" style="fill:red${" ".repeat(200_000)};stroke:blue"/>`)],
    ["200 thousand spaces before a declaration", svgOf(`<rect width="1" height="1" style="${" ".repeat(200_000)}fill:red"/>`)],
    ["a transform with 500 functions", svgOf(`<g transform="${"translate(1) ".repeat(500)}"><rect width="1" height="1"/></g>`)],
    ["a transform with many numbers, within the length limit", svgOf(`<g transform="translate(${"1 ".repeat(500)})"><rect width="1" height="1"/></g>`)],
    ["!important followed by a long run of spaces", svgOf(`<style>rect{fill:red !${" ".repeat(300_000)}important;stroke:blue ! ${" ".repeat(300_000)}x}</style><rect width="1" height="1"/>`)],
    ["a <style> with 100 thousand unclosed comments", svgOf(`<style>${"/*".repeat(100_000)}</style><rect width="1" height="1"/>`)],
    ["a <style> with 100 thousand closed comments", svgOf(`<style>${"/**/".repeat(100_000)}rect{fill:red}</style><rect width="1" height="1"/>`)],
    ["a <style> with 50 thousand rules", svgOf(`<style>${".a{fill:red}".repeat(50_000)}</style><rect width="1" height="1"/>`)],
    ["a <style> with 50 thousand at-rules", svgOf(`<style>${"@media x{.a{fill:red}}".repeat(30_000)}</style><rect width="1" height="1"/>`)],
    ["a <style> with a very long selector", svgOf(`<style>${"a".repeat(500_000)}{fill:red}</style><rect width="1" height="1"/>`)],
    ["a <style> with nested braces", svgOf(`<style>${"{".repeat(100_000)}</style><rect width="1" height="1"/>`)],
    ["a path of 500 KB", svgOf(`<path d="M0 0 ${"L1 1 ".repeat(100_000)}"/>`)],
    ["190 attributes on an element", svgOf(`<rect ${attrs(190)}/>`)],
    ["long runs in numeric lists", svgOf(`<polygon points="${"1,".repeat(200_000)}"/><rect width="1" height="1" x="${"1".repeat(100_000)}"/>`)],
    ["a very long text", svgOf(`<text>${"a&amp;".repeat(150_000)}</text>`)],
    ["many entities in an attribute", svgOf(`<text font-family="${"&#65;".repeat(100_000)}">x</text>`)],
    ["a very long run of unmatched characters in the prolog", `<?xml ${"?".repeat(100_000)} ?>${svgOf("")}`],
    ["a DOCTYPE with a huge subset", `<!DOCTYPE svg [${'<!ENTITY a "b">'.repeat(30_000)}]>${svgOf("")}`],
    ["a DOCTYPE with many quote characters", `<!DOCTYPE svg ${"'a' ".repeat(50_000)}>${svgOf("")}`],
    ["a long run of '<' characters", `<svg ${NS} width="10" height="10">${"<".repeat(100_000)}`],
    ["a long run of <!-- openers", `<svg ${NS} width="10" height="10">${"<!--".repeat(100_000)}`],
    ["a very long attribute name", `<svg ${NS} width="10" height="10"><rect ${"a".repeat(500_000)}="1"/></svg>`],
    ["a very long closing tag", `<svg ${NS} width="10" height="10"></${"a".repeat(500_000)}>`],
  ])("%s ends fast", (name, input) => {
    timed(name, input);
  });
});
