import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SvgLogoError, sanitizeSvg } from "./svg-sanitize";

/**
 * The reference graph of an SVG (ticket 15 B, fix 01): a mask that uses a mask that uses a mask... The renderer follows references recursively on a native stack that is not
 * deep, and a tree of references that branches is exponential, so what a document may nest, chain and cost is bounded, and what is past it is refused as svg_too_complex
 * BEFORE anything is drawn. These tests are written from the limits as they are specified (height 48, 6 references one after another, a cost of 10,000 counted every time a
 * reference is followed), never from the algorithm.
 */

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const bytes = (text: string) => Buffer.from(text, "utf8");
const doc = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg ${NS} ${XLINK} ${attrs}>${body}</svg>`;
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));

type Verdict = "ok" | "svg_too_complex" | string;
/** What the sanitizer says, with anything that is not a SvgLogoError (a RangeError from a deep recursion, a TypeError) thrown, so it fails the test loudly. */
function verdict(input: string | Uint8Array): Verdict {
  try { sanitizeSvg(typeof input === "string" ? bytes(input) : input); return "ok"; }
  catch (error) {
    if (!(error instanceof SvgLogoError)) throw error;
    return error.code;
  }
}
function timedVerdict(input: string | Uint8Array) {
  const started = performance.now();
  const result = verdict(input);
  return { result, ms: performance.now() - started };
}

const SHAPE = '<rect width="100" height="100" fill="#fff"/>';

/** A chain of `count` references, each one made by the element before it; the last one made by a drawn rectangle. `kind` says what kind of reference it is. */
const CHAINS: Record<string, (count: number) => string> = {
  mask: n => doc(`<defs><mask id="m0">${SHAPE}</mask>${Array.from({ length: n - 1 }, (_, i) => `<mask id="m${i + 1}" mask="url(#m${i})">${SHAPE}</mask>`).join("")}</defs><rect width="50" height="50" mask="url(#m${n - 1})"/>`),
  clipPath: n => doc(`<defs><clipPath id="c0">${SHAPE}</clipPath>${Array.from({ length: n - 1 }, (_, i) => `<clipPath id="c${i + 1}" clip-path="url(#c${i})">${SHAPE}</clipPath>`).join("")}</defs><rect width="50" height="50" clip-path="url(#c${n - 1})"/>`),
  "linearGradient xlink:href": n => doc(`<defs><linearGradient id="g0"><stop offset="0" stop-color="#f00"/></linearGradient>${Array.from({ length: n - 1 }, (_, i) => `<linearGradient id="g${i + 1}" xlink:href="#g${i}"/>`).join("")}</defs><rect width="50" height="50" fill="url(#g${n - 1})"/>`),
  "linearGradient href": n => doc(`<defs><linearGradient id="g0"><stop offset="0" stop-color="#f00"/></linearGradient>${Array.from({ length: n - 1 }, (_, i) => `<linearGradient id="g${i + 1}" href="#g${i}"/>`).join("")}</defs><rect width="50" height="50" fill="url(#g${n - 1})"/>`),
  "radialGradient href": n => doc(`<defs><radialGradient id="g0"><stop offset="0" stop-color="#f00"/></radialGradient>${Array.from({ length: n - 1 }, (_, i) => `<radialGradient id="g${i + 1}" xlink:href="#g${i}"/>`).join("")}</defs><rect width="50" height="50" stroke="url(#g${n - 1})"/>`),
  "paint that points at a mask": n => doc(`<defs><mask id="m0">${SHAPE}</mask>${Array.from({ length: n - 1 }, (_, i) => `<mask id="m${i + 1}"><rect width="100" height="100" fill="url(#m${i})"/></mask>`).join("")}</defs><rect width="50" height="50" stroke="url(#m${n - 1})"/>`),
  "style attribute": n => doc(`<defs><mask id="m0">${SHAPE}</mask>${Array.from({ length: n - 1 }, (_, i) => `<mask id="m${i + 1}" style="mask:url(#m${i})">${SHAPE}</mask>`).join("")}</defs><rect width="50" height="50" style="mask:url(#m${n - 1})"/>`),
  "class rule of a stylesheet": n => doc(`<style>${Array.from({ length: n - 1 }, (_, i) => `.k${i + 1}{mask:url(#m${i})}`).join("")}</style><defs><mask id="m0">${SHAPE}</mask>${Array.from({ length: n - 1 }, (_, i) => `<mask id="m${i + 1}" class="k${i + 1}">${SHAPE}</mask>`).join("")}</defs><rect width="50" height="50" mask="url(#m${n - 1})"/>`),
  "id rule of a stylesheet": n => doc(`<style>${Array.from({ length: n - 1 }, (_, i) => `#m${i + 1}{clip-path:url(#m${i})}`).join("")}</style><defs><clipPath id="m0">${SHAPE}</clipPath>${Array.from({ length: n - 1 }, (_, i) => `<clipPath id="m${i + 1}">${SHAPE}</clipPath>`).join("")}</defs><rect width="50" height="50" clip-path="url(#m${n - 1})"/>`),
  "tag rule of a stylesheet": n => doc(`<style>rect{mask:url(#m0)}</style><defs><mask id="m0"><circle cx="5" cy="5" r="4"/></mask></defs>${Array.from({ length: n }, () => '<rect width="5" height="5"/>').join("")}`),
};

describe("reference graph: a chain of references one after another", () => {
  it.each(Object.keys(CHAINS).filter(kind => kind !== "tag rule of a stylesheet"))("%s: 3 and 6 in a row are drawn, 7 is refused, and so are 50 and thousands (no stack overflow)", kind => {
    const build = CHAINS[kind]!;
    expect(verdict(build(3)), "3").toBe("ok");
    expect(verdict(build(6)), "6").toBe("ok");
    expect(verdict(build(7)), "7").toBe("svg_too_complex");
    expect(verdict(build(50)), "50").toBe("svg_too_complex");
    const started = performance.now();
    expect(verdict(build(3000)), "3000").toBe("svg_too_complex");
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("a chain of 5,000 masks of nothing but their own link (the longest the element limit lets through) is refused, not overflowed", () => {
    const n = 4900;
    const input = doc(`<defs>${Array.from({ length: n }, (_, i) => `<mask id="m${i}"${i ? ` mask="url(#m${i - 1})"` : ""}/>`).join("")}</defs><rect width="5" height="5" mask="url(#m${n - 1})"/>`);
    expect(timedVerdict(input)).toMatchObject({ result: "svg_too_complex" });
  });

  it("the two files of the review: a chain of 50 masks (5 KB, killed the process) and a tree of masks 13 deep (2 KB, took 30 s) are refused at once", () => {
    for (const name of ["mask-chain-crash.svg", "mask-tree-slow.svg"]) {
      const file = fixture(name);
      expect(file.length, name).toBeLessThan(6000);
      const { result, ms } = timedVerdict(file);
      expect(result, name).toBe("svg_too_complex");
      expect(ms, name).toBeLessThan(1000);
    }
  });

  it("a reference chain that reaches a mask by a use of a group with a mask counts the same hops", () => {
    const chain = (n: number) => doc(`<defs><mask id="m0">${SHAPE}</mask>${Array.from({ length: n - 1 }, (_, i) => `<mask id="m${i + 1}" mask="url(#m${i})">${SHAPE}</mask>`).join("")}<g id="t" mask="url(#m${n - 1})"><rect width="5" height="5"/></g></defs><use href="#t"/>`);
    expect(verdict(chain(5))).toBe("ok"); // use → g → 5 masks: 6 references one after another.
    expect(verdict(chain(6))).toBe("svg_too_complex"); // 7.
  });
});

describe("reference graph: a tree that branches at every level", () => {
  /** `depth` masks one inside the other, each with `width` shapes that use the next one down: the user applies the top one once, so there are width⁰ + width¹ ... applications. */
  const tree = (kind: "mask" | "clipPath", width: number, depth: number) => {
    const attr = kind === "mask" ? "mask" : "clip-path";
    const pieces = [`<${kind} id="t0">${SHAPE}</${kind}>`];
    for (let level = 1; level < depth; level++) pieces.push(`<${kind} id="t${level}">${Array.from({ length: width }, () => `<rect width="100" height="100" ${attr}="url(#t${level - 1})"/>`).join("")}</${kind}>`);
    return doc(`<defs>${pieces.join("")}</defs><rect width="50" height="50" ${attr}="url(#t${depth - 1})"/>`);
  };

  it.each(["mask", "clipPath"] as const)("%s: a binary tree is drawn up to 6 levels and refused from 7 (7, 9, 13 and 30 levels)", kind => {
    expect(verdict(tree(kind, 2, 6))).toBe("ok");
    for (const levels of [7, 9, 13, 30]) expect(verdict(tree(kind, 2, levels)), `${levels} levels`).toBe("svg_too_complex");
  });

  it("masks: what it costs decides, with the same depth: 3 wide and 5 deep (121 applications) is drawn, 4 wide (341), 10 wide and 100 wide 3 deep are refused", () => {
    expect(verdict(tree("mask", 3, 5))).toBe("ok");
    expect(verdict(tree("mask", 4, 5))).toBe("svg_too_complex");
    expect(verdict(tree("mask", 10, 5))).toBe("svg_too_complex");
    expect(verdict(tree("mask", 100, 3))).toBe("svg_too_complex");
  });

  it("clip paths cost a twentieth of a mask: the tree that is too dear as masks is cheap as clips, up to what the limit lets through", () => {
    expect(verdict(tree("clipPath", 3, 5))).toBe("ok");
    expect(verdict(tree("clipPath", 4, 5)), "4 wide, 341 applications").toBe("ok");
    expect(verdict(tree("clipPath", 100, 3)), "10,101 applications").toBe("svg_too_complex");
  });

  it("the same mask used by many elements is counted every time it is used: 150 are drawn, 250 are refused", () => {
    const used = (count: number) => doc(`<defs><mask id="m">${SHAPE}</mask></defs>${Array.from({ length: count }, () => '<rect width="5" height="5" mask="url(#m)"/>').join("")}`);
    expect(verdict(used(150))).toBe("ok");
    expect(verdict(used(250))).toBe("svg_too_complex");
  });

  it("what is in the mask counts too: a mask of 2,000 shapes used 4 times is drawn, used 10 times is refused", () => {
    const big = (uses: number) => doc(`<defs><mask id="m">${Array.from({ length: 2000 }, () => '<rect width="1" height="1"/>').join("")}</mask></defs>${Array.from({ length: uses }, () => '<rect width="5" height="5" mask="url(#m)"/>').join("")}`);
    expect(verdict(big(4))).toBe("ok");
    expect(verdict(big(10))).toBe("svg_too_complex");
  });

  it("clip paths and gradients are cheap enough for what a logo does: 1,000 elements with a clip path are drawn, and 1,000 with a gradient", () => {
    const defs = '<defs><clipPath id="c"><rect width="50" height="50"/></clipPath><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>';
    expect(verdict(doc(`${defs}${Array.from({ length: 1000 }, () => '<rect width="5" height="5" clip-path="url(#c)"/>').join("")}`))).toBe("ok");
    expect(verdict(doc(`${defs}${Array.from({ length: 1000 }, () => '<rect width="5" height="5" fill="url(#g)"/>').join("")}`))).toBe("ok");
  });

  it("a group that many <use> bring in is counted by the elements in it: 2,400 uses of a group of 3 shapes are drawn, 3,000 are refused", () => {
    const used = (count: number) => doc(`<defs><g id="g"><rect width="1" height="1"/><rect width="1" height="1"/><rect width="1" height="1"/></g></defs>${Array.from({ length: count }, () => '<use href="#g"/>').join("")}`);
    expect(verdict(used(2400))).toBe("ok");
    expect(verdict(used(3000))).toBe("svg_too_complex");
  });
});

describe("reference graph: what a stylesheet adds", () => {
  // Circles inside: a stylesheet that gave a mask to every rectangle would give it to the one in the mask too, which is a cycle (tested below).
  const DOT = '<circle cx="5" cy="5" r="4" fill="#fff"/>';
  const masks = `<defs><mask id="m">${DOT}</mask><mask id="n">${DOT}</mask></defs>`;

  it("a class rule reaches the elements that have the class and a tag rule all of that tag: 150 reached are drawn, 250 are refused", () => {
    const viaTag = (count: number) => doc(`<style>rect{mask:url(#m)}</style>${masks}${Array.from({ length: count }, () => '<rect width="5" height="5"/>').join("")}`);
    const viaClass = (count: number) => doc(`<style>.a{mask:url(#m)}</style>${masks}${Array.from({ length: count }, () => '<rect class="a" width="5" height="5"/>').join("")}`);
    const viaId = (count: number) => doc(`<style>#only{mask:url(#m)}</style>${masks}${Array.from({ length: count }, (_, i) => `<rect id="${i ? `x${i}` : "only"}" width="5" height="5"/>`).join("")}`);
    expect(verdict(viaTag(150))).toBe("ok");
    expect(verdict(viaTag(250))).toBe("svg_too_complex");
    expect(verdict(viaClass(150))).toBe("ok");
    expect(verdict(viaClass(250))).toBe("svg_too_complex");
    expect(verdict(viaId(250)), "an id rule reaches one element, whatever the others are").toBe("ok");
  });

  it("a plain selector reaches exactly what it names: a class of another element, or another tag, reaches nothing", () => {
    expect(verdict(doc(`<style>.nobody{mask:url(#m)}</style>${masks}${Array.from({ length: 400 }, () => '<rect class="somebody" width="5" height="5"/>').join("")}`))).toBe("ok");
    expect(verdict(doc(`<style>circle{mask:url(#m)}</style>${masks}${Array.from({ length: 400 }, () => '<rect width="5" height="5"/>').join("")}`))).toBe("ok");
    expect(verdict(doc(`<style>path.a.b{mask:url(#m)}</style>${masks}${Array.from({ length: 400 }, () => '<path class="a" d="M0 0"/><path class="b" d="M0 0"/><rect class="a b" width="5" height="5"/>').join("")}`)), "path.a.b needs a path with both").toBe("ok");
    expect(verdict(doc(`<style>path.a.b{mask:url(#m)}</style>${masks}${Array.from({ length: 400 }, () => '<path class="a b" d="M0 0"/>').join("")}`))).toBe("svg_too_complex");
  });

  it.each([
    ["a descendant selector", "svg rect"],
    ["an attribute selector", "rect[width]"],
    ["a child combinator", "svg > rect"],
    ["a pseudo-class", "rect:first-child"],
    ["a sibling combinator", "rect + rect"],
  ])("%s may reach any element: the same 250 rectangles are refused, even if it could not in fact reach them", (_name, selector) => {
    expect(verdict(doc(`<style>${selector}{mask:url(#m)}</style>${masks}${Array.from({ length: 250 }, () => '<rect width="5" height="5"/>').join("")}`))).toBe("svg_too_complex");
  });

  it.each<[string, (count: number) => string]>([
    ["linearGradient", count => Array.from({ length: count }, (_, i) => `<linearGradient id="lg${i}"><stop offset="0"/></linearGradient>`).join("")],
    ["radialGradient", count => Array.from({ length: count }, (_, i) => `<radialGradient id="rg${i}"><stop offset="0"/></radialGradient>`).join("")],
    ["stop", count => `<linearGradient id="one">${'<stop offset="0"/>'.repeat(count)}</linearGradient>`],
    ["defs", count => "<defs/>".repeat(count)],
    ["style", count => '<style>.a{fill:#f00}</style>'.repeat(count)],
  ])("a stylesheet gives no mask or paint to a %s (it has nothing to apply it to): 250 of them are drawn", (tag, make) => {
    const rule = `<style>${tag}{mask:url(#m)}</style>`;
    expect(verdict(doc(`${rule}<defs><mask id="m">${DOT}</mask></defs>${make(250)}`))).toBe("ok");
  });

  it("while the same rule on a tag that is drawn (a path, a circle, a text) is counted for each one", () => {
    for (const make of [() => '<path d="M0 0h1v1z"/>', () => '<circle r="1"/>', () => '<ellipse rx="1" ry="1"/>', () => '<g/>']) {
      const tag = make().slice(1).split(/[ />]/)[0]!;
      expect(verdict(doc(`<style>${tag}{mask:url(#m)}</style><defs><mask id="m"><line x1="0" x2="9" stroke="#fff"/></mask></defs>${Array.from({ length: 250 }, make).join("")}`)), tag).toBe("svg_too_complex");
    }
  });

  it("two rules that give a mask to two different elements cost two uses, and rules apply with every other reference the element makes", () => {
    expect(verdict(doc(`<style>#a{mask:url(#m)} #b{mask:url(#m)}</style>${masks}<rect id="a" width="5" height="5"/><rect id="b" width="5" height="5"/>`))).toBe("ok");
    // 3 rules of a chain make the element follow 4 references one after another by stylesheet and attribute together: still within 6; with 8 it is not.
    expect(verdict(CHAINS["class rule of a stylesheet"]!(3))).toBe("ok");
    expect(verdict(CHAINS["class rule of a stylesheet"]!(8))).toBe("svg_too_complex");
  });

  it("a stylesheet that makes a mask use itself, or a mask that uses the one it is inside, is a cycle", () => {
    expect(verdict(doc(`<style>rect{mask:url(#m)}</style><defs><mask id="m"><rect width="5" height="5"/></mask></defs><rect width="5" height="5"/>`))).toBe("svg_too_complex");
    expect(verdict(doc(`<style>.in{mask:url(#m)}</style><defs><mask id="m"><rect class="in" width="5" height="5"/></mask></defs><rect width="5" height="5" mask="url(#m)"/>`))).toBe("svg_too_complex");
  });

  it("bounds the work of reading the stylesheet itself: 1,000 rules with a url are read, 1,001 are refused; and rules times elements stay under a million", () => {
    const rules = (count: number, nodes: number) => doc(`<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><style>${Array.from({ length: count }, (_, i) => `.z${i}{fill:url(#g)}`).join("")}</style>${Array.from({ length: nodes }, () => '<rect width="1" height="1"/>').join("")}`);
    expect(verdict(rules(1000, 900)), "1,000 rules, 900 elements: 900,000 comparisons").toBe("ok");
    expect(verdict(rules(1000, 9000)), "1,000 rules, 9,000 elements: 9,000,000").toBe("svg_too_complex");
    expect(verdict(rules(1001, 1))).toBe("svg_too_complex");
  });

  it("counts the work of reading the references even when they point at nothing (and so cost nothing): 25,000 occurrences are refused, 15,000 are read", () => {
    const toNowhere = (rules: number) => doc(`<style>${Array.from({ length: rules }, () => "svg *{fill:url(#nowhere)}").join("")}</style>${Array.from({ length: 1000 }, () => '<rect width="1" height="1"/>').join("")}`);
    expect(verdict(toNowhere(15))).toBe("ok");
    expect(verdict(toNowhere(25))).toBe("svg_too_complex");
  });

  it("bounds the references it counts: one rule on 9,000 shapes is drawn, a hundred of them are refused", () => {
    const star = (rules: number) => doc(`<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><style>${Array.from({ length: rules }, () => "svg *{fill:url(#g)}").join("")}</style>${Array.from({ length: 9000 }, () => '<rect width="1" height="1"/>').join("")}`);
    const started = performance.now();
    expect(verdict(star(1))).toBe("ok");
    expect(verdict(star(100))).toBe("svg_too_complex");
    expect(performance.now() - started, "slack on purpose").toBeLessThan(4000);
  });
});

describe("reference graph: cycles, duplicates and what points nowhere", () => {
  it.each<[string, string]>([
    ["a mask that uses itself", doc(`<defs><mask id="m" mask="url(#m)">${SHAPE}</mask></defs><rect width="5" height="5" mask="url(#m)"/>`)],
    ["a mask whose content uses it", doc(`<defs><mask id="m"><rect width="5" height="5" mask="url(#m)"/></mask></defs><rect width="5" height="5" mask="url(#m)"/>`)],
    ["a clip path that uses itself", doc(`<defs><clipPath id="c" clip-path="url(#c)">${SHAPE}</clipPath></defs><rect width="5" height="5" clip-path="url(#c)"/>`)],
    ["a → b → a", doc(`<defs><mask id="a" mask="url(#b)">${SHAPE}</mask><mask id="b" mask="url(#a)">${SHAPE}</mask></defs><rect width="5" height="5" mask="url(#a)"/>`)],
    ["a → b → c → a", doc(`<defs><mask id="a" mask="url(#b)">${SHAPE}</mask><mask id="b" mask="url(#c)">${SHAPE}</mask><mask id="c" mask="url(#a)">${SHAPE}</mask></defs><rect width="5" height="5" mask="url(#a)"/>`)],
    ["a gradient whose href is itself", doc(`<defs><linearGradient id="g" xlink:href="#g"/></defs><rect width="5" height="5" fill="url(#g)"/>`)],
    ["gradients whose hrefs are each other", doc(`<defs><linearGradient id="a" xlink:href="#b"/><linearGradient id="b" href="#a"/></defs><rect width="5" height="5" fill="url(#a)"/>`)],
    ["a mask and a clip path that use each other", doc(`<defs><mask id="m" clip-path="url(#c)">${SHAPE}</mask><clipPath id="c" mask="url(#m)">${SHAPE}</clipPath></defs><rect width="5" height="5" mask="url(#m)"/>`)],
    ["a paint that points at the mask it is in", doc(`<defs><mask id="m"><rect width="5" height="5" fill="url(#m)"/></mask></defs><rect width="5" height="5" mask="url(#m)"/>`)],
  ])("%s is refused", (_name, input) => {
    expect(timedVerdict(input)).toMatchObject({ result: "svg_too_complex" });
  });

  it("a cycle nobody draws is still refused: it is in the document, and a reference to it can be added by a stylesheet", () => {
    expect(verdict(doc(`<defs><mask id="a" mask="url(#b)">${SHAPE}</mask><mask id="b" mask="url(#a)">${SHAPE}</mask></defs><rect width="5" height="5"/>`))).toBe("ok");
  });

  it("a <use> that points at a group that holds a <use> is pruned before this (and so is not a cycle)", () => {
    expect(verdict(doc(`<defs><g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g></defs><use href="#a"/><rect width="5" height="5"/>`))).toBe("ok");
  });

  it("an id defined twice counts as the dearer definition, wherever it comes in the document", () => {
    const deep = (n: number) => Array.from({ length: n }, (_, i) => `<mask id="d${i}"${i ? ` mask="url(#d${i - 1})"` : ""}>${SHAPE}</mask>`).join("");
    const harmless = '<mask id="d11">' + SHAPE + "</mask>";
    // d11 first defined harmless, then as the end of a 12 deep chain (and the other way round): either way the chain is there.
    const use = '<rect width="5" height="5" mask="url(#d11)"/>';
    expect(verdict(doc(`<defs>${harmless}${deep(12)}</defs>${use}`)), "harmless first").toBe("svg_too_complex");
    expect(verdict(doc(`<defs>${deep(12)}${harmless}</defs>${use}`)), "harmless last").toBe("svg_too_complex");
    // And if both are harmless it is drawn.
    expect(verdict(doc(`<defs><mask id="d11">${SHAPE}</mask><mask id="d11">${SHAPE}</mask></defs>${use}`))).toBe("ok");
    // The dearer one counts for its cost as well: 12 masks of nothing but shapes, defined next to a cheap one.
    const dear = `<mask id="x">${Array.from({ length: 300 }, () => '<rect width="1" height="1"/>').join("")}</mask>`;
    const cheap = `<mask id="x">${SHAPE}</mask>`;
    const uses = Array.from({ length: 40 }, () => '<rect width="5" height="5" mask="url(#x)"/>').join("");
    expect(verdict(doc(`<defs>${cheap}${dear}</defs>${uses}`)), "cheap first, 40 × (50 + 301)").toBe("svg_too_complex");
    expect(verdict(doc(`<defs>${dear}${cheap}</defs>${uses}`)), "cheap last").toBe("svg_too_complex");
    expect(verdict(doc(`<defs>${cheap}${cheap}</defs>${uses}`)), "both cheap: 40 × 52").toBe("ok");
  });

  it("an id that exists nowhere costs nothing, however many point at it, and whatever it is spelled like", () => {
    const nothing = doc(Array.from({ length: 330 }, (_, i) => `<rect width="1" height="1" mask="url(#gone${i % 7})" clip-path="url(#gone)" fill="url(#nope)"/>`).join(""));
    expect(verdict(nothing)).toBe("ok");
    expect(verdict(doc(`<defs><mask id="m">${SHAPE}</mask></defs><rect width="5" height="5" mask="url(#M)"/>`))).toBe("ok"); // Case matters: #M is not #m.
  });

  it("what is only defined, in defs/symbol/mask/clipPath that nobody points at, is not drawn and does not count", () => {
    const junk = '<g><rect width="1" height="1" mask="url(#m)"/></g>'.repeat(400);
    expect(verdict(doc(`<defs><mask id="m">${SHAPE}</mask>${junk}</defs>`))).toBe("ok");
    expect(verdict(doc(`<defs><mask id="m">${SHAPE}</mask></defs><defs>${junk}</defs><symbol id="s">${junk}</symbol>`))).toBe("ok");
    expect(verdict(doc(`<defs><mask id="m">${SHAPE}</mask></defs><mask id="other">${junk}</mask><clipPath id="cp">${junk}</clipPath>`))).toBe("ok");
    // The same junk drawn in the document is counted.
    expect(verdict(doc(`<defs><mask id="m">${SHAPE}</mask></defs>${junk}`))).toBe("svg_too_complex");
  });
});

describe("reference graph: how deep the drawing nests", () => {
  const nest = (levels: number, inner = '<rect width="5" height="5"/>') => `${"<g>".repeat(levels)}${inner}${"</g>".repeat(levels)}`;

  it("plain elements: <svg> + 46 groups + a rectangle (48) are drawn, 47 groups are refused, and 40 are drawn", () => {
    expect(verdict(doc(nest(40)))).toBe("ok");
    expect(verdict(doc(nest(46)))).toBe("ok");
    expect(verdict(doc(nest(47)))).toBe("svg_too_complex");
  });

  it("a <use> counts what it brings in as nested in it: a group of 20 levels used at 20 levels is drawn, 30 and 30 or 60 and 60 are refused", () => {
    const made = (inside: number, brought: number) => doc(`<defs><g id="t">${nest(brought)}</g></defs>${nest(inside, '<use href="#t"/>')}`);
    expect(verdict(made(20, 20))).toBe("ok");
    expect(verdict(made(30, 20))).toBe("svg_too_complex"); // The case the review gave: a use of a group 20 deep, placed 30 deep.
    expect(verdict(made(30, 30))).toBe("svg_too_complex");
    expect(verdict(made(60, 60))).toBe("svg_too_complex");
  });

  it("a mask counts what is in it as nested in the element that uses it: a mask with 20 levels on an element 20 deep is drawn, 60 and 60 is refused", () => {
    const made = (inside: number, brought: number) => doc(`<defs><mask id="m">${nest(brought)}</mask></defs>${nest(inside, '<rect width="5" height="5" mask="url(#m)"/>')}`);
    expect(verdict(made(20, 20))).toBe("ok");
    expect(verdict(made(60, 60))).toBe("svg_too_complex");
    expect(verdict(made(40, 20))).toBe("svg_too_complex");
  });

  it.each([10, 20])("the exact edge, through a reference of any kind (target with %i levels): the chain svg + k groups + the element that points + the target + its levels + a shape is 48 at the most", brought => {
    // The element that points holds the target inside it: one more level for the target itself. k + brought + 4 = 48 is drawn, one more group is not.
    const through: Array<[string, (k: number) => string]> = [
      ["use", k => doc(`<defs><g id="t">${nest(brought)}</g></defs>${nest(k, '<use href="#t"/>')}`)],
      ["mask", k => doc(`<defs><mask id="t">${nest(brought)}</mask></defs>${nest(k, '<rect width="5" height="5" mask="url(#t)"/>')}`)],
      ["clipPath", k => doc(`<defs><clipPath id="t">${nest(brought)}</clipPath></defs>${nest(k, '<rect width="5" height="5" clip-path="url(#t)"/>')}`)],
    ];
    for (const [kind, build] of through) {
      expect(verdict(build(44 - brought)), `${kind}: ${44 - brought} groups`).toBe("ok");
      expect(verdict(build(45 - brought)), `${kind}: ${45 - brought} groups`).toBe("svg_too_complex");
    }
  });

  it("a reference made inside what a reference brought in adds its own level: the edge moves down by one for every hop", () => {
    // svg + k groups + a rect that uses mask 1 (mask 1 holds a rect that uses mask 0, which holds `brought` groups and a rect).
    const twoHops = (k: number, brought: number) => doc(`<defs><mask id="m0">${nest(brought)}</mask><mask id="m1"><rect width="5" height="5" mask="url(#m0)"/></mask></defs>${nest(k, '<rect width="5" height="5" mask="url(#m1)"/>')}`);
    // 1 (svg) + k + 1 (the rect) + 1 (m1) + 1 (its rect) + 1 (m0) + brought + 1 (the shape) = k + brought + 6.
    expect(verdict(twoHops(42 - 10, 10))).toBe("ok");
    expect(verdict(twoHops(43 - 10, 10))).toBe("svg_too_complex");
  });

  it("a chain of 6 masks, each with 3 groups nested in it, is drawn; with 10 groups it is refused", () => {
    const made = (levels: number) => doc(`<defs><mask id="m0">${SHAPE}</mask>${Array.from({ length: 5 }, (_, i) => `<mask id="m${i + 1}">${nest(levels, `<rect width="5" height="5" mask="url(#m${i})"/>`)}</mask>`).join("")}</defs><rect width="5" height="5" mask="url(#m5)"/>`);
    expect(verdict(made(3))).toBe("ok");
    expect(verdict(made(10))).toBe("svg_too_complex");
  });

  it("the height is counted through references of every kind, not only masks: clip paths and plain <use> targets too", () => {
    const clip = (levels: number) => doc(`<defs><clipPath id="c">${nest(levels)}</clipPath></defs>${nest(levels, '<rect width="5" height="5" clip-path="url(#c)"/>')}`);
    expect(verdict(clip(15))).toBe("ok");
    expect(verdict(clip(30))).toBe("svg_too_complex");
  });
});

describe("reference graph: documents that are real logos stay as they are", () => {
  it("the owner's logo (24 paths, 3 gradients, a stylesheet with classes)", () => {
    const paths = Array.from({ length: 24 }, (_, i) => `<path class="cls-${(i % 3) + 1}" d="M${i} 0L${i + 10} 10L0 ${i}Z"/>`).join("");
    const input = doc(`<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4002b"/><stop offset="1" stop-color="#6b46c1"/></linearGradient><linearGradient id="g2" xlink:href="#g1"/><radialGradient id="g3"><stop offset="0" stop-color="#fff"/></radialGradient></defs><style>.cls-1{fill:url(#g1)}.cls-2{fill:url(#g2)}.cls-3{fill:url(#g3)}</style>${paths}`, 'viewBox="0 0 240 80"');
    expect(verdict(input)).toBe("ok");
  });

  it("an Illustrator export with .cls-1{fill:url(#linear-gradient)} classes", () => {
    const input = doc(`<defs><linearGradient id="linear-gradient" x1="0" x2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient><style>.cls-1{fill:url(#linear-gradient)}.cls-2{fill:#231f20}</style></defs><g><path class="cls-1" d="M0 0h50v50z"/><path class="cls-2" d="M50 50h40v40z"/></g>`);
    expect(verdict(input)).toBe("ok");
  });

  it("an Inkscape export with defs and a clip path", () => {
    const input = doc(`<defs id="defs2"><clipPath id="clipPath1" clipPathUnits="userSpaceOnUse"><rect width="100" height="100"/></clipPath><linearGradient id="g1"><stop offset="0" style="stop-color:#f00"/></linearGradient></defs><g id="layer1" clip-path="url(#clipPath1)"><rect style="fill:url(#g1)" width="50" height="50"/></g>`);
    expect(verdict(input)).toBe("ok");
  });

  it("a mask and a gradient three levels deep", () => {
    const input = doc(`<defs><linearGradient id="g0"><stop offset="0" stop-color="#fff"/></linearGradient><linearGradient id="g1" xlink:href="#g0"/><mask id="m0"><rect width="100" height="100" fill="url(#g1)"/></mask><mask id="m1" mask="url(#m0)"><rect width="100" height="100" fill="#fff"/></mask></defs><rect width="100" height="100" fill="#123456" mask="url(#m1)"/>`);
    expect(verdict(input)).toBe("ok");
  });

  it("an ordinary logo with a handful of clips, masks and gradients, each used a few times", () => {
    const uses = Array.from({ length: 12 }, (_, i) => `<path d="M${i} 0h5v5z" fill="url(#g)" clip-path="url(#c)" ${i % 4 === 0 ? 'mask="url(#m)"' : ""}/>`).join("");
    expect(verdict(doc(`<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient><clipPath id="c"><circle cx="50" cy="50" r="40"/></clipPath><mask id="m"><rect width="100" height="100" fill="#fff"/></mask></defs>${uses}`))).toBe("ok");
  });
});

describe("reference graph: refusing is not a crash", () => {
  it("only ever answers svg_too_complex for what it refuses, with the code as the message and nothing of the file", () => {
    const secret = "SECRET-TOKEN-4711";
    const error = (() => { try { sanitizeSvg(bytes(CHAINS.mask!(60).replace("m0", secret))); return null; } catch (e) { return e; } })();
    expect(error).toBeInstanceOf(SvgLogoError);
    expect(error).toMatchObject({ code: "svg_too_complex", message: "svg_too_complex" });
    expect(String((error as Error).stack)).not.toContain(secret);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Differential: random small graphs, judged by a naive oracle written from the specification (it unrolls the graph with no memory, one reference at a time).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

type NodeKind = "mask" | "clipPath" | "gradient" | "group";
type GraphNode = { id: string; kind: NodeKind; children: string[][]; own: string[] }; // children: the references of each child shape; own: the references of the element itself.
type Graph = { nodes: GraphNode[]; rootShapes: string[][]; rootUses: string[] };

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `deep` makes long chains (each node points at the one before it) and wide nodes: the shapes that reach the hop and the cost limits. */
function randomGraph(random: () => number, deep: boolean): Graph {
  const count = deep ? 6 + Math.floor(random() * 7) : 2 + Math.floor(random() * 8);
  const kinds: NodeKind[] = deep ? ["mask", "mask", "mask", "clipPath", "clipPath", "gradient", "group"] : ["mask", "mask", "clipPath", "gradient", "group"];
  const nodes: GraphNode[] = Array.from({ length: count }, (_, i) => ({ id: `n${i}`, kind: kinds[Math.floor(random() * kinds.length)]!, children: [], own: [] }));
  // What may be pointed at by an attribute (mask, clip-path, fill): not a group, which only a <use> brings in. A group may be pointed at only from the document.
  const pointable = nodes.filter(node => node.kind !== "group");
  // Mostly toward nodes defined earlier (so a chain or a tree forms), now and then to any (a cycle, a self reference).
  const pick = (from: number): string | null => {
    const pool = random() < (deep ? 0.02 : 0.12) ? pointable : pointable.filter(node => Number(node.id.slice(1)) < from);
    if (deep && pool.length && random() < 0.9) return pool.filter(node => Number(node.id.slice(1)) >= from - 2).at(-1)?.id ?? pool.at(-1)!.id; // The one just before.
    return pool.length ? pool[Math.floor(random() * pool.length)]!.id : null;
  };
  nodes.forEach((node, index) => {
    if (node.kind === "gradient") {
      const target = nodes.find(other => other.kind === "gradient" && Number(other.id.slice(1)) < index && random() < 0.7);
      if (target) node.own.push(target.id); // xlink:href: a gradient chain.
      return;
    }
    const shapes = deep ? 2 + Math.floor(random() * 3) : 1 + Math.floor(random() * 3);
    for (let s = 0; s < shapes; s++) {
      const refs: string[] = [];
      for (let r = deep ? 1 + Math.floor(random() * 2) : Math.floor(random() * 3); r > 0; r--) { const target = pick(index); if (target) refs.push(target); }
      node.children.push(refs);
    }
    if (node.kind !== "group" && random() < 0.25) { const target = pick(index); if (target) node.own.push(target); }
  });
  const rootShapes: string[][] = [];
  for (let s = 1 + Math.floor(random() * 3); s > 0; s--) {
    const refs: string[] = [];
    for (let r = Math.floor(random() * 3); r > 0; r--) { const target = pointable[Math.floor(random() * pointable.length)]; if (target) refs.push(target.id); }
    rootShapes.push(refs);
  }
  const groups = nodes.filter(node => node.kind === "group");
  const rootUses = groups.filter(() => random() < 0.8).map(node => node.id);
  return { nodes, rootShapes, rootUses };
}

/** An attribute that points at `target`, in the way that kind of node is pointed at. */
function referenceAttribute(target: GraphNode): string {
  return target.kind === "mask" ? "mask" : target.kind === "clipPath" ? "clip-path" : "fill";
}

function render(graph: Graph): string {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const refsAttributes = (ids: string[]) => {
    const seen = new Set<string>();
    // One attribute of each kind at most (an element cannot say `mask` twice): the first of each kind wins, which the oracle must know too (see `effectiveRefs`).
    return effectiveRefs(ids, byId).map(id => { const kind = referenceAttribute(byId.get(id)!); return seen.has(kind) ? "" : (seen.add(kind), ` ${kind}="url(#${id})"`); }).join("");
  };
  const shape = (ids: string[]) => `<rect width="5" height="5"${refsAttributes(ids)}/>`;
  const defs = graph.nodes.map(node => {
    if (node.kind === "gradient") return `<linearGradient id="${node.id}"${node.own[0] ? ` xlink:href="#${node.own[0]}"` : ""}><stop offset="0" stop-color="#f00"/></linearGradient>`;
    const own = refsAttributes(node.own);
    const inner = node.children.map(shape).join("");
    return node.kind === "group" ? `<g id="${node.id}"${own}>${inner}</g>` : `<${node.kind} id="${node.id}"${own}>${inner}</${node.kind}>`;
  }).join("");
  return doc(`<defs>${defs}</defs>${graph.rootShapes.map(shape).join("")}${graph.rootUses.map(id => `<use href="#${id}"/>`).join("")}`);
}

/** The references an element really makes: an element says each of `mask`, `clip-path` and `fill` once, so of two references of the same kind the first stays. */
function effectiveRefs(ids: string[], byId: Map<string, GraphNode>): string[] {
  const seen = new Set<string>();
  return ids.filter(id => { const kind = referenceAttribute(byId.get(id)!); if (seen.has(kind)) return false; seen.add(kind); return true; });
}

const LIMITS = { cost: 10_000, hops: 6 };

/** Why the specification refuses the graph, or null: a cycle, more than 6 references one after another, or a cost over 10,000, counting every time a reference is followed. */
function oracleRefuses(graph: Graph): "cycle" | "hops" | "cost" | null {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const elements = (node: GraphNode) => node.kind === "gradient" ? 2 : 1 + node.children.length;
  const charge = (node: GraphNode) => node.kind === "mask" ? 50 + elements(node) : node.kind === "clipPath" ? 3 + elements(node) : node.kind === "gradient" ? 1 : elements(node);
  /** What following `id` costs, `path` being the references followed to get here. Throws on what is refused. */
  const follow = (id: string, path: string[]): number => {
    if (path.includes(id)) throw new Error("cycle");
    if (path.length + 1 > LIMITS.hops) throw new Error("hops");
    const node = byId.get(id)!;
    const here = [...path, id];
    let cost = charge(node);
    const inner = [...(node.kind === "gradient" ? node.own : effectiveRefs(node.own, byId))];
    for (const refs of node.children) inner.push(...effectiveRefs(refs, byId));
    for (const next of inner) { cost += follow(next, here); if (cost > LIMITS.cost) throw new Error("cost"); }
    return cost;
  };
  try {
    let total = 0;
    for (const refs of graph.rootShapes) for (const id of effectiveRefs(refs, byId)) { total += follow(id, []); if (total > LIMITS.cost) return "cost"; }
    for (const id of graph.rootUses) { total += follow(id, []); if (total > LIMITS.cost) return "cost"; }
    return null;
  } catch (error) { return (error as Error).message as "cycle" | "hops" | "cost"; }
}

describe("reference graph: random graphs agree with an oracle written from the specification", () => {
  it("accepts and refuses exactly what the oracle does, on 600 graphs (cycles, long chains and dear trees all common)", () => {
    const random = seeded(20261002);
    const tally = { accepted: 0, cycle: 0, hops: 0, cost: 0 };
    const disagreements: string[] = [];
    for (let i = 0; i < 600; i++) {
      const graph = randomGraph(random, i % 2 === 1);
      const input = render(graph);
      const why = oracleRefuses(graph);
      const actual = verdict(input);
      if ((actual === "svg_too_complex") !== (why !== null) || (actual !== "ok" && actual !== "svg_too_complex")) disagreements.push(`#${i} oracle ${why ?? "accepts"}, sanitizer ${actual}: ${input}`);
      tally[why ?? "accepted"]++;
    }
    expect(disagreements.slice(0, 3)).toEqual([]);
    // Every way of being refused is exercised, and a good share is accepted: the agreement is not an accident of one kind of graph.
    expect(tally.accepted, JSON.stringify(tally)).toBeGreaterThan(100);
    expect(tally.cycle, JSON.stringify(tally)).toBeGreaterThan(15);
    expect(tally.hops, JSON.stringify(tally)).toBeGreaterThan(15);
    expect(tally.cost, JSON.stringify(tally)).toBeGreaterThan(15);
  });
});
