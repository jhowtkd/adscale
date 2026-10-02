/**
 * Turns an untrusted SVG logo into a small, static, self-contained SVG that is safe to rasterize (ticket 15, item 2).
 *
 * The file is hostile input (the site of any address a person types, or a file a person sends). Nothing here trusts a parser to be safe: the text is READ by a
 * strict tokenizer into a tree, filtered through allow-lists of elements, attributes and values, and WRITTEN again from that tree. The rasterizer only ever sees
 * text this module produced, so a difference between how two parsers read the same bytes cannot matter. What never survives:
 *   - scripts, `foreignObject`, animations, filters, patterns, markers, embedded images, links, and every element or attribute outside the allow-lists;
 *   - every reference that leaves the document: only `#fragment` references stay (`href`, `url(#id)`), so nothing is fetched, from the network or from disk;
 *   - the DOCTYPE with everything it declares, processing instructions and comments: no entity is ever expanded (only the five predefined ones and numeric
 *     references are read), so an external entity or a "billion laughs" file cannot do anything, and a reference to an entity that is not one of those rejects the file;
 *   - at-rules in `<style>` (`@import`, `@font-face`, `@media`...) and every CSS value that is not a plain color, number, length, keyword or `url(#id)`.
 * Limits: input bytes, elements, depth, `<use>` expansion, references and `<text>` count, and the GRAPH the references form (a mask that uses a mask that uses a mask...): how
 * deep the drawing nests through it, how many references are followed one from another and what drawing it all takes, cycles refused. A document that exceeds them, or that is not
 * well formed, is rejected.
 */

/** Bytes of the file read from a site or sent by a person. A logo is a few KB; anything past this is not a logo. */
export const MAX_SVG_BYTES = 1024 * 1024;
/** The longest side of the PNG the SVG becomes. */
export const SVG_LOGO_LONG_SIDE_PX = 1024;
const MAX_ELEMENTS = 10_000;
const MAX_DEPTH = 64;
const MAX_ATTRIBUTES = 200;
const MAX_USE_EXPANSION = 20_000;
const MAX_REFERENCES = 1_000;
/**
 * The graph the references form (a mask that uses a mask that uses a mask...) and what drawing it takes. The renderer follows references recursively, and its native stack is
 * not deep: 100 elements nested in one another (counting what a `<use>`, a mask or a clip path brings into the one that points at it) kill the process, and so does a chain of 50
 * masks (5 KB); a tree of masks 13 deep (2 KB) takes 30 s. `MAX_DRAW_DEPTH` is how deep the drawing may nest in all (a real logo nests ten at the most), `MAX_REFERENCE_DEPTH` how
 * many references may be followed one from another (a real logo, two or three), and `MAX_REFERENCE_COST` what drawing everything may take, in units that follow what the
 * renderer does each time a reference is followed (see `limitReferenceGraph`): about 2 s of drawing at the most. The rest bound the work of reading the graph itself.
 */
const MAX_DRAW_DEPTH = 48;
const MAX_REFERENCE_DEPTH = 6;
const MAX_REFERENCE_COST = 10_000;
const MAX_REFERENCE_OCCURRENCES = 20_000;
const MAX_STYLE_REFERENCE_RULES = 1_000;
const MAX_STYLE_MATCHES = 1_000_000;
const MAX_TEXTS = 200;
/** A logo wider than this (or taller, by the same ratio) is a banner, and would be a sliver at the output size. */
const MAX_ASPECT = 20;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

export type SvgRejection = "svg_too_large" | "svg_malformed" | "svg_unsupported" | "svg_too_complex" | "svg_empty" | "svg_render_failed" | "svg_timeout" | "svg_busy";
/** Why an SVG was not turned into a logo. Never carries the content of the file. */
export class SvgLogoError extends Error {
  constructor(readonly code: SvgRejection) { super(code); this.name = "SvgLogoError"; }
}
const reject = (code: SvgRejection): never => { throw new SvgLogoError(code); };

/** Whether the first bytes of a response are an SVG document, for a server that sent no (or a wrong) type. */
export function looksLikeSvg(head: Uint8Array): boolean {
  return /<svg[\s>]/i.test(new TextDecoder("utf-8").decode(head.subarray(0, 4096)));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Reading: a strict tokenizer. Iterative (no recursion on the input), linear, and it never expands an entity or follows a reference.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

type TextChunk = { raw: string; cdata: boolean };
type SvgNode = { name: string; attrs: Array<[string, string]>; children: Array<SvgNode | TextChunk> };
const isNode = (child: SvgNode | TextChunk): child is SvgNode => "name" in child;
const NAME_CHAR = /[A-Za-z0-9_.:-]/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

function tokenize(text: string): SvgNode {
  const n = text.length;
  let i = 0, seen = 0;
  const bad = (): never => reject("svg_malformed");
  const startsWith = (s: string) => text.startsWith(s, i);
  const skipSpace = () => { while (i < n && (text[i] === " " || text[i] === "\t" || text[i] === "\r" || text[i] === "\n")) i++; };
  const skipPast = (end: string) => { const j = text.indexOf(end, i); if (j < 0) bad(); i = j + end.length; };
  const readName = () => {
    const start = i;
    while (i < n && NAME_CHAR.test(text[i]!)) i++;
    if (i === start || i - start > 64 || !/[A-Za-z_]/.test(text[start]!)) bad();
    return text.slice(start, i);
  };
  /** The DOCTYPE, with its internal subset: skipped whole, never read. Quotes and comments inside the subset are honored so a `>` in them does not end it early. */
  const skipDoctype = () => {
    i += 9;
    let inSubset = false;
    while (i < n) {
      const ch = text[i]!;
      if (ch === '"' || ch === "'") { const j = text.indexOf(ch, i + 1); if (j < 0) bad(); i = j + 1; continue; }
      if (inSubset && startsWith("<!--")) { i += 4; skipPast("-->"); continue; }
      if (inSubset && startsWith("<?")) { i += 2; skipPast("?>"); continue; }
      if (ch === "[") inSubset = true;
      else if (ch === "]") inSubset = false;
      else if (ch === ">" && !inSubset) { i++; return; }
      i++;
    }
    bad();
  };

  for (;;) {
    skipSpace();
    if (startsWith("<?")) { i += 2; skipPast("?>"); }
    else if (startsWith("<!--")) { i += 4; skipPast("-->"); }
    else if (text.slice(i, i + 9).toUpperCase() === "<!DOCTYPE") skipDoctype();
    else break;
  }
  if (!startsWith("<")) bad();

  const stack: SvgNode[] = [];
  let root: SvgNode | null = null;
  while (i < n) {
    if (text[i] !== "<") {
      const j = text.indexOf("<", i);
      const end = j < 0 ? n : j;
      const chunk = text.slice(i, end);
      i = end;
      const top = stack.at(-1);
      if (top) top.children.push({ raw: chunk, cdata: false });
      else if (chunk.trim()) bad(); // Text outside the root element.
      continue;
    }
    if (startsWith("<!--")) { i += 4; skipPast("-->"); continue; }
    if (startsWith("<![CDATA[")) {
      i += 9;
      const j = text.indexOf("]]>", i);
      const top = stack.at(-1);
      if (j < 0 || !top) bad();
      top!.children.push({ raw: text.slice(i, j), cdata: true });
      i = j + 3;
      continue;
    }
    if (startsWith("<?")) { i += 2; skipPast("?>"); continue; }
    if (startsWith("<!")) bad();
    if (startsWith("</")) {
      i += 2;
      const name = readName();
      skipSpace();
      if (text[i] !== ">") bad();
      i++;
      if (stack.pop()?.name !== name) bad();
      continue;
    }
    i++;
    const name = readName();
    const attrs: Array<[string, string]> = [];
    let selfClosing = false;
    for (;;) {
      skipSpace();
      if (startsWith("/>")) { selfClosing = true; i += 2; break; }
      if (text[i] === ">") { i++; break; }
      const attr = readName();
      skipSpace();
      if (text[i] !== "=") bad();
      i++;
      skipSpace();
      const quote = text[i];
      if (quote !== '"' && quote !== "'") bad();
      const j = text.indexOf(quote!, i + 1);
      if (j < 0) bad();
      const value = text.slice(i + 1, j);
      if (value.includes("<") || attrs.length >= MAX_ATTRIBUTES || attrs.some(([existing]) => existing === attr)) bad();
      attrs.push([attr, value]);
      i = j + 1;
    }
    if (++seen > MAX_ELEMENTS) reject("svg_too_complex");
    const node: SvgNode = { name, attrs, children: [] };
    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else if (root) bad(); // A second root element.
    else root = node;
    if (!selfClosing) {
      if (stack.length >= MAX_DEPTH) reject("svg_too_complex");
      stack.push(node);
    }
  }
  if (stack.length || !root) bad();
  return root!;
}

const ENTITY = /&(?:#x[0-9A-Fa-f]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos);/g;
const NAMED: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
/** The five predefined entities and numeric references. Any other `&...;` is an entity this module never expands: the file is rejected. */
function decode(raw: string): string {
  if (!raw.includes("&")) return raw;
  if (raw.replace(ENTITY, "").includes("&")) reject("svg_malformed");
  return raw.replace(ENTITY, entity => {
    if (NAMED[entity]) return NAMED[entity]!;
    const code = entity[2] === "x" ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    const valid = code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
    return valid ? String.fromCodePoint(code) : reject("svg_malformed");
  });
}
const chunkText = (chunk: TextChunk) => chunk.cdata ? chunk.raw : decode(chunk.raw);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Allow-lists. Every value is checked by a linear pattern (or by hand): none of these has nested quantifiers.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

type Check = (value: string) => string | null;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const LENGTH = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:px|pt|pc|mm|cm|in|em|ex|%)?$/;
const number: Check = v => v.length <= 40 && NUMBER.test(v) ? v : null;
const length: Check = v => v.length <= 40 && LENGTH.test(v) ? v : null;
const keyword: Check = v => /^[A-Za-z][A-Za-z0-9-]{0,39}$/.test(v) ? v : null;
const keywordList: Check = v => /^[A-Za-z0-9 -]{1,80}$/.test(v) ? v : null;
const keywordOrNumber: Check = v => keyword(v) ?? number(v);
const lengthOrKeyword: Check = v => length(v) ?? keyword(v);
const numberList: Check = v => /^[0-9eE+\-.,\s]*$/.test(v) ? v : null;
const pathData: Check = v => /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]*$/.test(v) ? v : null;
const fontFamily: Check = v => /^[A-Za-z0-9 ,'"._-]{1,200}$/.test(v) ? v : null;
const identifier: Check = v => /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(v) ? v : null;
const classNames: Check = v => /^[A-Za-z0-9_ -]{0,256}$/.test(v) ? v : null;
const localHref: Check = v => /^#[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(v) ? v : null;
const LOCAL_URL = /^url\(\s*(['"]?)#([A-Za-z_][A-Za-z0-9_.:-]{0,127})\1\s*\)$/;
/** `none`, or a reference to something inside this document. */
const reference: Check = v => v === "none" ? v : LOCAL_URL.test(v) ? v : null;
const COLOR_FUNCTION = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/+-]+\)$/i;
/** A color, a keyword or a reference to a paint server of this document (with an optional plain color after it). Never an address. */
const paint: Check = v => {
  v = v.trim();
  if (v.length > 200) return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^[A-Za-z]{3,25}$/.test(v) || COLOR_FUNCTION.test(v)) return v;
  const end = v.indexOf(")");
  if (!v.startsWith("url(") || end < 0) return null;
  const fallback = v.slice(end + 1).trim();
  if (!LOCAL_URL.test(v.slice(0, end + 1))) return null;
  return !fallback || /^[A-Za-z]{3,25}$/.test(fallback) || /^#[0-9a-fA-F]{3,8}$/.test(fallback) || COLOR_FUNCTION.test(fallback) ? v : null;
};
const PAR = /^(?:defer\s+)?(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:\s+(?:meet|slice))?$/;
const preserveAspectRatio: Check = v => v.length <= 40 && PAR.test(v) ? v : null;
const TRANSFORM_FUNCTION = /^(?:matrix|translate|scale|rotate|skewX|skewY)\s*\(([0-9eE+\-.,\s]*)\)\s*,?\s*/;
/** Checked by hand: one anchored pattern per function, so there is nothing to backtrack over. */
const transform: Check = v => {
  if (v.length > 1024) return null;
  let rest = v.trim();
  while (rest) {
    const match = TRANSFORM_FUNCTION.exec(rest);
    if (!match) return null;
    rest = rest.slice(match[0].length);
  }
  return v;
};

/** What a style may say about how a shape is drawn. Left out on purpose: `filter`, dashes (a tiny dash on a long path is a classic way to hang a renderer), markers, cursors, events. */
const PRESENTATION: Record<string, Check> = {
  fill: paint, stroke: paint, "stop-color": paint, color: paint,
  "fill-opacity": number, "stroke-opacity": number, opacity: number, "stop-opacity": number,
  "stroke-width": length, "stroke-miterlimit": number,
  "fill-rule": keyword, "clip-rule": keyword, "stroke-linecap": keyword, "stroke-linejoin": keyword,
  display: keyword, visibility: keyword, "text-anchor": keyword, "dominant-baseline": keyword, "alignment-baseline": keyword,
  "font-style": keyword, "font-weight": keywordOrNumber, "font-variant": keyword, "font-stretch": keyword, "text-decoration": keywordList, "writing-mode": keyword,
  "shape-rendering": keyword, "text-rendering": keyword, "mix-blend-mode": keyword, isolation: keyword, "paint-order": keywordList,
  "font-size": lengthOrKeyword, "letter-spacing": lengthOrKeyword, "word-spacing": lengthOrKeyword, "baseline-shift": lengthOrKeyword,
  "font-family": fontFamily, "clip-path": reference, mask: reference,
};
const ATTRIBUTES: Record<string, Check> = {
  ...PRESENTATION,
  id: identifier, class: classNames, transform, gradientTransform: transform, d: pathData, points: numberList,
  x: length, y: length, cx: length, cy: length, r: length, rx: length, ry: length, x1: length, y1: length, x2: length, y2: length,
  width: length, height: length, fx: length, fy: length, fr: length, offset: length, startOffset: length, textLength: length,
  dx: numberList, dy: numberList, rotate: numberList, viewBox: numberList, preserveAspectRatio,
  gradientUnits: keyword, spreadMethod: keyword, clipPathUnits: keyword, maskUnits: keyword, maskContentUnits: keyword, lengthAdjust: keyword, "xml:space": keyword,
  href: localHref, "xlink:href": localHref,
};
const KEPT_ELEMENTS = new Set(["svg", "g", "defs", "symbol", "use", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "text", "tspan", "textPath", "style",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
/** Containers that only group: their children are kept (Illustrator wraps its content in `<switch>`), the container is not. */
const UNWRAPPED_ELEMENTS = new Set(["a", "switch"]);
const TEXT_ELEMENTS = new Set(["text", "tspan", "textPath"]);

/** What a stylesheet rule points at (`fill:url(#a)`): the elements its selector reaches follow those references too. */
type CssReference = { selector: string; targets: string[] };
const ID_CHAR = /[A-Za-z0-9_.:-]/;
/** The ids a text points at with `url(#id)`, in order and with repeats (each one is a reference to follow). Read by hand, in one pass. */
function urlTargets(text: string): string[] {
  const targets: string[] = [];
  for (let from = 0;;) {
    const at = text.indexOf("url(", from);
    if (at < 0) break;
    let i = at + 4;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (text[i] === "'" || text[i] === '"') i++;
    if (text[i] !== "#") { from = i; continue; }
    let end = i + 1;
    while (end < text.length && ID_CHAR.test(text[end]!)) end++;
    if (end > i + 1) targets.push(text.slice(i + 1, end));
    from = end;
  }
  return targets;
}

/** `prop: value; prop: value` read declaration by declaration: what is not an allowed property with an allowed value is dropped. */
function cleanDeclarations(body: string): string {
  const kept: string[] = [];
  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    let value = declaration.slice(colon + 1).trim();
    if (value.length > 400) continue;
    // `!important` is read by hand: a pattern for it is quadratic on a long run of spaces.
    const bang = value.lastIndexOf("!");
    const important = bang >= 0 && value.slice(bang + 1).trim().toLowerCase() === "important";
    if (important) value = value.slice(0, bang).trim();
    const check = Object.hasOwn(PRESENTATION, name) ? PRESENTATION[name] : undefined;
    const clean = check ? check(value) : null;
    if (clean !== null) kept.push(`${name}:${clean}${important ? " !important" : ""}`);
  }
  return kept.join(";");
}

/** The index just after the `}` that closes the block opened at `open`. */
function endOfBlock(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i + 1;
  }
  return reject("svg_malformed");
}

/**
 * The stylesheet of the file, rule by rule. At-rules are dropped whole (`@import` would fetch, `@font-face` would load a font, `@media`/`@keyframes` are not static),
 * and so is every rule whose selector is not made of plain selector characters. Whatever stays has only allowed declarations.
 */
function cleanCss(source: string): { css: string; refs: CssReference[] } {
  let css = "";
  for (let from = 0; from < source.length;) { // Comments, found by hand: a lazy pattern is quadratic on a file full of unterminated ones.
    const open = source.indexOf("/*", from);
    if (open < 0) { css += source.slice(from); break; }
    css += `${source.slice(from, open)} `;
    const close = source.indexOf("*/", open + 2);
    if (close < 0) break;
    from = close + 2;
  }
  if (css.includes("\\")) reject("svg_unsupported"); // An escape can spell any word: nothing is read through one.
  const rules: string[] = [];
  const refs: CssReference[] = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i]!)) i++;
    if (i >= css.length) break;
    if (css[i] === "@") {
      const semicolon = css.indexOf(";", i), brace = css.indexOf("{", i);
      if (brace >= 0 && (semicolon < 0 || brace < semicolon)) i = endOfBlock(css, brace);
      else if (semicolon >= 0) i = semicolon + 1;
      else break;
      continue;
    }
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const close = css.indexOf("}", open + 1);
    if (close < 0) reject("svg_malformed");
    const selector = css.slice(i, open).trim();
    const body = css.slice(open + 1, close);
    i = close + 1;
    if (body.includes("{") || !/^[A-Za-z0-9_.#>+~*,:[\]="'()\s^$|-]{1,500}$/.test(selector)) continue;
    const declarations = cleanDeclarations(body);
    if (!declarations) continue;
    rules.push(`${selector}{${declarations}}`);
    const targets = urlTargets(declarations);
    if (targets.length) refs.push({ selector, targets });
  }
  return { css: rules.join("\n"), refs };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Filtering: the tree that is written back.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

type SafeNode = { name: string; attrs: Array<[string, string]>; children: Array<SafeNode | string> };
const isSafeNode = (child: SafeNode | string): child is SafeNode => typeof child !== "string";
type State = { texts: number; cssRefs: CssReference[] };

function cleanAttributes(node: SvgNode): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  for (const [name, raw] of node.attrs) {
    if (name === "style") {
      const style = cleanDeclarations(decode(raw));
      if (style) attrs.push(["style", style]);
      continue;
    }
    const check = Object.hasOwn(ATTRIBUTES, name) ? ATTRIBUTES[name] : undefined;
    if (!check) continue; // Not allow-listed: event handlers, prefixed and data-* attributes, `filter`, `xmlns:*`, vendor extensions...
    const clean = check(decode(raw));
    if (clean !== null) attrs.push([name, clean]);
  }
  return attrs;
}

function clean(node: SvgNode, state: State): SafeNode[] {
  if (UNWRAPPED_ELEMENTS.has(node.name)) return node.children.flatMap(child => isNode(child) ? clean(child, state) : []);
  if (!KEPT_ELEMENTS.has(node.name)) return [];
  if (node.name === "text" && ++state.texts > MAX_TEXTS) reject("svg_too_complex");
  const attrs = node.name === "style" ? [] : cleanAttributes(node);
  const children: Array<SafeNode | string> = [];
  if (node.name === "style") {
    const { css, refs } = cleanCss(node.children.map(child => isNode(child) ? "" : chunkText(child)).join(""));
    if (!css) return [];
    for (const ref of refs) state.cssRefs.push(ref);
    if (state.cssRefs.length > MAX_STYLE_REFERENCE_RULES) reject("svg_too_complex");
    children.push(css);
  } else {
    for (const child of node.children) {
      if (isNode(child)) children.push(...clean(child, state));
      else if (TEXT_ELEMENTS.has(node.name)) children.push(chunkText(child));
    }
  }
  if (node.name === "use" && !attrs.some(([name]) => name === "href" || name === "xlink:href")) return []; // Inert without a local target.
  return [{ name: node.name, attrs, children }];
}

/**
 * A `<use>` may only point at something that holds no `<use>` of its own, so nothing expands more than once (the "billion laughs" of SVG is a chain of them),
 * and what all the `<use>` elements bring in together is bounded.
 */
function limitUses(root: SafeNode) {
  const byId = new Map<string, SafeNode>();
  const size = new Map<SafeNode, number>();
  const holdsUse = new Map<SafeNode, boolean>();
  const index = (node: SafeNode): void => {
    const id = node.attrs.find(([name]) => name === "id")?.[1];
    if (id && !byId.has(id)) byId.set(id, node);
    let total = 1, uses = node.name === "use";
    for (const child of node.children) {
      if (!isSafeNode(child)) continue;
      index(child);
      total += size.get(child)!;
      uses ||= holdsUse.get(child)!;
    }
    size.set(node, total);
    holdsUse.set(node, uses);
  };
  index(root);
  let expansion = 0;
  const prune = (node: SafeNode): void => {
    node.children = node.children.filter(child => {
      if (!isSafeNode(child)) return true;
      if (child.name !== "use") { prune(child); return true; }
      const target = byId.get(child.attrs.find(([name]) => name === "href" || name === "xlink:href")?.[1]?.slice(1) ?? "");
      if (!target || holdsUse.get(target)) return false; // Missing, or it holds a <use> (an ancestor and the element itself included).
      expansion += size.get(target)!;
      if (expansion > MAX_USE_EXPANSION) reject("svg_too_complex");
      return true;
    });
  };
  prune(root);
}

type Facts = { classes: Set<string>; id: string | undefined };
/** The elements a stylesheet selector reaches. A plain one (`rect`, `.cls-1`, `#logo`, `path.a.b`) is matched on the element; anything else (a combinator, an attribute, a pseudo-class) may reach any. */
function selectorMatchers(selectorList: string): Array<(node: SafeNode, facts: Facts) => boolean> {
  return selectorList.split(",").map(part => {
    const plain = /^([A-Za-z][A-Za-z0-9-]*|\*)?((?:[.#][A-Za-z_][A-Za-z0-9_-]*)*)$/.exec(part.trim());
    if (!plain) return () => true;
    const tag = plain[1] && plain[1] !== "*" ? plain[1] : null;
    const marks = plain[2]!.match(/[.#][A-Za-z_][A-Za-z0-9_-]*/g) ?? [];
    return (node, { classes, id }) => (!tag || node.name === tag) && marks.every(mark => mark[0] === "." ? classes.has(mark.slice(1)) : id === mark.slice(1));
  });
}

const attributeOf = (node: SafeNode, name: string) => node.attrs.find(([key]) => key === name)?.[1];
/** Never drawn where they stand: what is in them is drawn when something points at it. Never given a mask or a paint by a stylesheet either (a gradient is not painted with itself). */
const NOT_DRAWN = new Set(["defs", "symbol", "mask", "clipPath", "linearGradient", "radialGradient", "stop", "style"]);
/** Elements a stylesheet gives no mask or paint to: they have nothing to apply it to (a mask or clip path is not on this list: a stylesheet can nest those). */
const STYLE_IGNORED = new Set(["defs", "linearGradient", "radialGradient", "stop", "style"]);

/**
 * The renderer follows references one from another, and each time one is followed it resolves what it points at and everything in it. The graph they form is bounded by how
 * deep the drawing nests (stack: elements in one another, counting what a reference brings into the element that points at it), by how many references are followed one from
 * another, and by what drawing the whole document resolves, counting every time a reference is followed (time: a tree that branches at every level is exponential in a few KB).
 * Cost is counted in elements resolved, plus a charge for what the renderer does besides, measured on the real renderer: a mask is drawn into a surface of its own at every use
 * (about 5 ms at full size, so 50 units, against 0.1 ms an element), a clip path is cheaper (3), a gradient is only read (1). A cycle is refused. Every kind of reference counts:
 * masks, clip paths, paint servers, gradient `href` chains, `<use>`, and what a stylesheet adds to the elements its selectors reach; and when an id is defined twice, the dearer
 * definition counts (the renderer takes the first, and nothing here depends on that).
 */
function limitReferenceGraph(root: SafeNode, cssRefs: CssReference[]) {
  const refused = (): never => reject("svg_too_complex");
  if (cssRefs.length > MAX_STYLE_REFERENCE_RULES) refused();
  const rules = cssRefs.map(rule => ({ matchers: selectorMatchers(rule.selector), targets: rule.targets }));
  const definitions = new Map<string, SafeNode[]>();
  const size = new Map<SafeNode, number>();
  const own = new Map<SafeNode, string[]>();
  let occurrences = 0, compared = 0;
  const collect = (node: SafeNode): void => {
    const id = attributeOf(node, "id");
    if (id) { const same = definitions.get(id); if (same) same.push(node); else definitions.set(id, [node]); }
    const targets: string[] = [];
    for (const [name, value] of node.attrs) {
      if (name === "href" || name === "xlink:href") targets.push(value.slice(1));
      else if (value.includes("url(")) for (const target of urlTargets(value)) targets.push(target);
    }
    if (rules.length && !STYLE_IGNORED.has(node.name)) {
      if ((compared += rules.length) > MAX_STYLE_MATCHES) refused();
      const facts: Facts = { classes: new Set((attributeOf(node, "class") ?? "").split(/\s+/)), id };
      for (const rule of rules) if (rule.matchers.some(matches => matches(node, facts))) for (const target of rule.targets) targets.push(target);
    }
    if ((occurrences += targets.length) > MAX_REFERENCE_OCCURRENCES) refused();
    if (targets.length) own.set(node, targets);
    let total = 1;
    for (const child of node.children) if (isSafeNode(child)) { collect(child); total += size.get(child)!; }
    size.set(node, total);
  };
  collect(root);

  /** `height` is how many elements nest below (references followed included), `hops` how many references are followed one from another, `cost` what it all resolves. */
  type Weight = { cost: number; hops: number; height: number };
  const checked = (weight: Weight): Weight => {
    if (weight.height >= MAX_DRAW_DEPTH || weight.hops > MAX_REFERENCE_DEPTH || weight.cost > MAX_REFERENCE_COST) refused();
    return weight;
  };
  /** What one use of a reference costs by itself: a mask is drawn into a surface of its own, a clip path is lighter, a gradient is read, and anything else (a `<use>` target) is drawn. */
  const charge = (target: SafeNode) => {
    const elements = size.get(target)!;
    return target.name === "mask" ? 50 + elements : target.name === "clipPath" ? 3 + elements : target.name.endsWith("Gradient") ? 1 : elements;
  };
  const resolved = new Map<string, Weight>();
  const inside = new Map<SafeNode, Weight>();
  const following = new Set<string>();
  /**
   * What following a reference costs: the elements it resolves, its charge, and every reference made inside what it points at. `level` is how many references deep this one
   * is: past the limit it is refused on the way down, so a chain thousands long never gets this function deep into its own stack.
   */
  const follow = (id: string, level: number): Weight => {
    const targets = definitions.get(id);
    if (!targets) return { cost: 0, hops: 0, height: 0 }; // Points at nothing: nothing is drawn.
    const known = resolved.get(id);
    if (known) return known;
    if (level > MAX_REFERENCE_DEPTH || following.has(id)) return refused(); // Too deep, or a cycle.
    following.add(id);
    let cost = 0, hops = 0, height = 0;
    for (const target of targets) {
      const within = subtree(target, level);
      cost = Math.max(cost, charge(target) + within.cost);
      hops = Math.max(hops, 1 + within.hops);
      height = Math.max(height, 1 + within.height);
    }
    following.delete(id);
    const weight = checked({ cost, hops, height });
    resolved.set(id, weight);
    return weight;
  };
  /** What drawing an element and what is drawn in it costs (the element itself not counted: it is drawn anyway; what is only defined in it is not drawn). */
  const subtree = (node: SafeNode, level: number): Weight => {
    const known = inside.get(node);
    if (known) return known;
    let cost = 0, hops = 0, height = 0;
    for (const target of own.get(node) ?? []) {
      const weight = follow(target, level + 1);
      cost += weight.cost; hops = Math.max(hops, weight.hops); height = Math.max(height, weight.height);
    }
    for (const child of node.children) {
      if (!isSafeNode(child) || NOT_DRAWN.has(child.name)) continue;
      const weight = subtree(child, level);
      cost += weight.cost; hops = Math.max(hops, weight.hops); height = Math.max(height, 1 + weight.height);
    }
    const weight = checked({ cost, hops, height });
    inside.set(node, weight);
    return weight;
  };
  subtree(root, 0);
}

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, "&quot;");
function write(node: SafeNode): string {
  const attrs = node.attrs.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("");
  if (!node.children.length) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(child => isSafeNode(child) ? write(child) : escapeText(child)).join("")}</${node.name}>`;
}

const UNITS: Record<string, number> = { "": 1, px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
/** An absolute length in pixels; a percentage, `em` or anything else is no size. */
function pixels(value: string | undefined): number | null {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(px|pt|pc|mm|cm|in)?$/.exec(value ?? "");
  const result = match ? Number(match[1]) * UNITS[match[2] ?? ""]! : null;
  return result !== null && Number.isFinite(result) && result > 0 ? result : null;
}

export type SanitizedSvg = { svg: string; width: number; height: number };

/**
 * The clean SVG and the pixel size it must be drawn at: its longest side is `SVG_LOGO_LONG_SIDE_PX`, whatever the file declares, so a hostile `width`/`height`
 * never decides how much memory the rasterizer is asked for. Throws `SvgLogoError` for anything that is not a plain, well formed, reasonably sized SVG.
 */
export function sanitizeSvg(source: Uint8Array): SanitizedSvg {
  if (source.byteLength === 0) reject("svg_malformed");
  if (source.byteLength > MAX_SVG_BYTES) reject("svg_too_large");
  let markup: string;
  try { markup = new TextDecoder("utf-8", { fatal: true }).decode(source); } catch { return reject("svg_malformed"); }
  if (CONTROL_CHARS.test(markup)) reject("svg_malformed");
  const parsed = tokenize(markup);
  if (parsed.name !== "svg") reject("svg_unsupported");
  // The default namespace says it is an SVG. An entity reference there (old Illustrator files) is not read, and does not need to be: the output declares the right one.
  const declared = parsed.attrs.find(([name]) => name === "xmlns")?.[1];
  if (declared !== undefined && !/^&[A-Za-z_][A-Za-z0-9_.-]*;$/.test(declared) && decode(declared) !== SVG_NAMESPACE) reject("svg_unsupported");

  const state: State = { texts: 0, cssRefs: [] };
  const [rootNode] = clean(parsed, state);
  if (!rootNode) return reject("svg_unsupported");
  limitUses(rootNode);
  limitReferenceGraph(rootNode, state.cssRefs);

  const own = new Map(rootNode.attrs);
  const box = (own.get("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const viewBox = box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0 ? box : null;
  const declaredWidth = pixels(own.get("width")), declaredHeight = pixels(own.get("height"));
  const frame = declaredWidth && declaredHeight ? { width: declaredWidth, height: declaredHeight } : viewBox ? { width: viewBox[2]!, height: viewBox[3]! } : null;
  if (!frame) return reject("svg_unsupported"); // Nothing says how big it is, or how it scales.
  const aspect = frame.width / frame.height;
  if (!Number.isFinite(aspect) || aspect > MAX_ASPECT || aspect < 1 / MAX_ASPECT) reject("svg_unsupported");
  const width = aspect >= 1 ? SVG_LOGO_LONG_SIDE_PX : Math.max(1, Math.round(SVG_LOGO_LONG_SIDE_PX * aspect));
  const height = aspect >= 1 ? Math.max(1, Math.round(SVG_LOGO_LONG_SIDE_PX / aspect)) : SVG_LOGO_LONG_SIDE_PX;

  rootNode.attrs = [
    ["xmlns", SVG_NAMESPACE], ["xmlns:xlink", XLINK_NAMESPACE],
    ["width", String(width)], ["height", String(height)], ["viewBox", viewBox ? viewBox.join(" ") : `0 0 ${frame.width} ${frame.height}`],
    ...rootNode.attrs.filter(([name]) => !["width", "height", "viewBox"].includes(name)),
  ];
  const svg = write(rootNode);
  if ((svg.match(/url\(#/g)?.length ?? 0) > MAX_REFERENCES) reject("svg_too_complex");
  return { svg, width, height };
}
