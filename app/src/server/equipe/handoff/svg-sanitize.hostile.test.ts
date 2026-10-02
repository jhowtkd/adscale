import { describe, expect, it } from "vitest";
import { SvgLogoError } from "./svg-logo";
import { sanitizeSvg } from "./svg-sanitize";

/**
 * The sanitizer runs in the SERVER process, synchronously, before anything is drawn (ticket 15 B, review of 75f6ab99): what it does with a hostile file stops every request of
 * every workspace for as long as it takes. The review found that 1 MiB of `@;` took 3.9 s (the at-rule scan was quadratic). These tests give the whole sanitizer ~1 MiB of the
 * cheap repetitions that could do it again (selectors, declarations, comments, attributes, text, entities, DOCTYPEs, repeated `<style>`, names, references) and require each to be
 * answered in far less than a quadratic loop could manage, in the same way (`ok` or the refusal the file deserves) so the input still reaches the code it is meant for.
 */

const MIB = 1024 * 1024;
/** Linear code answers these in 1 to 30 ms on a laptop; the quadratic one needed 550 ms to 4 s. A limit that is ten times the first and half the second is steady on a slow runner. */
const BUDGET_MS = 300;
const NS = `xmlns="http://www.w3.org/2000/svg"`;
const frame = (inside: string) => `<svg ${NS} viewBox="0 0 10 10" width="10" height="10">${inside}</svg>`;
const withStyle = (css: string) => frame(`<style>${css}</style><rect width="10" height="10" fill="red"/>`);
/** `unit` repeated up to about `total` characters. */
const fill = (unit: string, total = MIB - 400) => unit.repeat(Math.floor(total / unit.length));

/** `ok`, or the code of the refusal. */
function codeOf(run: () => unknown): string {
  try { run(); return "ok"; } catch (error) { return error instanceof SvgLogoError ? error.code : `crashed: ${String(error).slice(0, 80)}`; }
}

/** The best of up to three runs: a hiccup of the machine does not fail a test, while a loop that is quadratic is slow every time. */
function bestOf(input: Uint8Array): { ms: number; outcome: string } {
  let best = Infinity, outcome = "";
  for (let run = 0; run < 3 && best > 60; run++) {
    const began = performance.now();
    outcome = codeOf(() => sanitizeSvg(input));
    best = Math.min(best, performance.now() - began);
  }
  return { ms: best, outcome };
}

describe("sanitizeSvg: the at-rules of a stylesheet (the review's file)", () => {
  const atRules = (count: number, unit = "@;") => withStyle(unit.repeat(count));

  it("1 MiB of `@;` (the review's file) is refused in a few milliseconds", () => {
    const input = Buffer.from(atRules(500_000));
    expect(input.length).toBeGreaterThan(MIB - 50_000);
    const { ms, outcome } = bestOf(input);
    expect(outcome).toBe("svg_too_complex");
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it.each([[200_000, "400 KB"], [350_000, "700 KB"]])("%i of `@;` (%s, where the quadratic scan took 0.6 s and 2.0 s) is refused as fast", count => {
    const { ms, outcome } = bestOf(Buffer.from(atRules(count)));
    expect(outcome).toBe("svg_too_complex");
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it.each([
    ["@; (nothing but a semicolon)", "@;", 500_000],
    ["@{} (an empty block, no semicolon anywhere)", "@{}", 333_000],
    ["@a b; (a name and a semicolon)", "@a b;", 200_000],
    ["@media{} (an empty media block)", "@media{}", 125_000],
    ["@import x; (what would fetch)", "@import url(a);", 66_000],
    ["@a{b{c}} (a block with a block in it)", "@a{b{c}}", 125_000],
  ])("a file made of %s is refused as too complex, fast", (_name, unit, count) => {
    const { ms, outcome } = bestOf(Buffer.from(atRules(count, unit)));
    expect(outcome).toBe("svg_too_complex");
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  describe("the number of at-rules is capped (200 in all the stylesheets of the file)", () => {
    const rule = "a{fill:red}";
    const kept = (svg: string) => sanitizeSvg(Buffer.from(svg)).svg;

    it("200 of them are dropped, whatever they are, and the rules around them stay", () => {
      const dropped = Array.from({ length: 200 }, (_, i) => ["@import url(a);", "@media x{b{fill:blue}}", "@font-face{src:url(x)}", "@charset 'x';"][i % 4]).join("");
      const out = kept(withStyle(`${rule}${dropped}c{fill:green}`));
      expect(out).toContain("a{fill:red}");
      expect(out).toContain("c{fill:green}");
      expect(out).not.toMatch(/@|blue|import|font-face/);
    });

    it("the 201st is refused as svg_too_complex", () => {
      expect(codeOf(() => kept(atRules(201)))).toBe("svg_too_complex");
      expect(codeOf(() => kept(atRules(200)))).toBe("ok");
    });

    it("they count together across the <style> elements of the file", () => {
      const styles = (each: number, elements: number) => frame(`${Array.from({ length: elements }, () => `<style>${"@a;".repeat(each)}</style>`).join("")}<rect width="10" height="10" fill="red"/>`);
      expect(codeOf(() => kept(styles(60, 3)))).toBe("ok"); // 180
      expect(codeOf(() => kept(styles(70, 3)))).toBe("svg_too_complex"); // 210
    });

    it("what is inside a rule is not an at-rule of the stylesheet: it does not count", () => {
      expect(codeOf(() => kept(withStyle(`a{fill:red;${"@x;".repeat(500)}}`)))).toBe("ok");
    });

    it("an at-rule ends at the first `;` or `{`, whichever comes first, and a block ends at its own closing brace", () => {
      const css = "@a x; p{fill:red} @b y{q{fill:blue}} r{fill:green} @c z{} s{fill:black}";
      const out = kept(withStyle(css));
      expect(out).toContain("p{fill:red}");
      expect(out).toContain("r{fill:green}");
      expect(out).toContain("s{fill:black}");
      expect(out).not.toContain("blue");
    });

    it("an at-rule that nothing ends takes the rest of the stylesheet with it, and one that opens a block nothing closes is not well formed", () => {
      const out = kept(withStyle("p{fill:red} @x y z"));
      expect(out).toContain("p{fill:red}");
      expect(codeOf(() => kept(withStyle("p{fill:red} @x{ q{fill:blue}")))).toBe("svg_malformed");
    });
  });
});

describe("sanitizeSvg: ~1 MiB of cheap repetitions is answered in linear time", () => {
  type Family = [name: string, make: () => string, expected: string];
  const ok = "ok", tooComplex = "svg_too_complex", malformed = "svg_malformed";
  const families: Family[] = [
    // The stylesheet: rules, selectors, declarations, comments, stray characters.
    ["empty rules `a{}`", () => withStyle(fill("a{}")), ok],
    ["rules `.c{fill:red}`", () => withStyle(fill(".c{fill:red}")), ok],
    ["rules that point at a paint (more than the file may have)", () => withStyle(fill(".c{fill:url(#g)}")), tooComplex],
    ["one selector list of 1 MiB", () => withStyle(`${fill("a,", MIB - 500)}b{fill:red}`), ok],
    ["one rule with 100,000 declarations", () => withStyle(`a{${fill("fill:red;")}}`), ok],
    ["one declaration with a value of 1 MiB", () => withStyle(`a{fill:${fill("x")}}`), ok],
    ["comments `/**/`", () => withStyle(fill("/**/")), ok],
    ["a comment that never ends", () => withStyle(`a{fill:red}/*${fill("x")}`), ok],
    ["declarations split by comments", () => withStyle(`a{${fill("fill/**/:/**/red;")}}`), ok],
    ["white space in front of a selector", () => withStyle(`a${fill(" ")}{fill:red}`), ok],
    ["stray `}`", () => withStyle(fill("}")), ok],
    ["stray `{`", () => withStyle(fill("{")), malformed],
    ["stray `;`", () => withStyle(fill(";")), ok],
    ["a backslash at the end of a long stylesheet", () => withStyle(`a{fill:red}${fill("x")}\\`), "svg_unsupported"],
    // The document: <style> repeated, elements, attributes, text, entities, DOCTYPE, comments, names.
    ["`<style>` repeated", () => frame(fill("<style>a{fill:red}</style>")), tooComplex],
    ["`<style>` with at-rules, repeated", () => frame(`${fill("<style>@;@;@;@;</style>", 90_000)}<rect width="10" height="10" fill="red"/>`), tooComplex],
    ["200,000 elements", () => frame(fill("<g/>")), tooComplex],
    ["the most elements allowed, with long attributes", () => frame(fill(`<g id="${"a".repeat(90)}"></g>`, 900_000)), ok],
    ["90,000 attributes on one tag", () => frame(`<g ${Array.from({ length: 90_000 }, (_, i) => `a${i}="1"`).join(" ")}/>`), malformed],
    ["60,000 namespace declarations on one tag", () => `<svg ${NS} ${Array.from({ length: 60_000 }, (_, i) => `xmlns:a${i}="u"`).join(" ")} viewBox="0 0 10 10" width="10" height="10"/>`, malformed],
    ["a path of 1 MiB", () => frame(`<path d="${fill("M0 0L1 1 ")}"/>`), ok],
    ["an id of 1 MiB", () => frame(`<g id="${fill("a")}"/>`), ok],
    ["a style attribute of 1 MiB", () => frame(`<g style="${fill("fill:red;")}"/>`), ok],
    ["a paint of 1 MiB", () => frame(`<g fill="${fill("url(#a) ")}"/>`), ok],
    ["a viewBox of 1 MiB", () => `<svg ${NS} viewBox="${fill("1 ")}" width="10" height="10"/>`, ok],
    ["a point list of 1 MiB", () => frame(`<polygon points="${fill("1,1 ")}"/>`), ok],
    ["text of 1 MiB", () => frame(`<text>${fill("a")}</text>`), ok],
    ["text of 1 MiB of `&amp;`", () => frame(`<text>${fill("&amp;")}</text>`), ok],
    ["text of 1 MiB of numeric references", () => frame(`<text>${fill("&#x41;")}</text>`), ok],
    ["an attribute of 1 MiB of `&amp;`", () => frame(`<g id="${fill("&amp;")}"/>`), ok],
    ["1 MiB of text and an entity that is not there", () => frame(`<text>${fill("a")}&nope;</text>`), malformed],
    ["200 `<text>` of 5 KB", () => frame(Array.from({ length: 200 }, () => `<text>${"a".repeat(5000)}</text>`).join("")), ok],
    ["a DOCTYPE with 1 MiB of declarations", () => `<?xml version="1.0"?><!DOCTYPE svg [${fill('<!ENTITY a "x">')}]>${frame("")}`, ok],
    ["a DOCTYPE with nested brackets", () => `<!DOCTYPE svg [${fill("[<!ENTITY a '<>'>]", MIB - 300)}]>${frame("")}`, ok],
    ["comments `<!---->`", () => frame(fill("<!---->")), ok],
    ["processing instructions", () => frame(fill("<?a b?>")), ok],
    ["a CDATA section of 1 MiB in a <style>", () => frame(`<style><![CDATA[${fill("a{}")}]]></style>`), ok],
    ["white space between attributes", () => `<svg ${NS}${fill(" ")}viewBox="0 0 10 10" width="10" height="10"/>`, ok],
    ["white space in the content", () => frame(fill(" ")), ok],
    ["`<` 1 MiB of times", () => frame(`<text>${fill("<")}</text>`), malformed],
    ["a tag that never ends", () => frame(`<g ${fill("a ")}`), malformed],
    ["an element name of 1 MiB", () => frame(`<${fill("a")}/>`), malformed],
    ["an attribute name of 1 MiB", () => frame(`<g ${fill("a")}="1"/>`), malformed],
    ["an end tag name of 1 MiB", () => frame(`<g></${fill("a")}>`), malformed],
    ["end tags that do not match", () => frame(fill("</g>")), malformed],
    ["60 nested <svg> with long attributes", () => frame(`${Array.from({ length: 60 }, () => `<svg id="${"a".repeat(120)}" style="${"fill:red;".repeat(1500)}">`).join("")}${"</svg>".repeat(60)}`), tooComplex],
    // The references: the analysis of the graph is made of the same loops.
    ["100,000 elements with the same id, and a paint that points at it", () => frame(`${fill('<g id="a"/>', 100_000)}<rect fill="url(#a)" width="10" height="10"/>`), ok],
    ["20,000 paints that point at nothing", () => frame(fill('<g fill="url(#n)"/>', 400_000)), tooComplex],
    ["10,000 `<use>`", () => `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" width="10" height="10"><defs><g id="u"><rect width="10" height="10"/></g></defs>${fill('<use xlink:href="#u"/>', 300_000)}</svg>`, tooComplex],
  ];

  it.each(families)("%s", (_name, make, expected) => {
    const input = Buffer.from(make());
    expect(input.length).toBeLessThanOrEqual(MIB);
    const { ms, outcome } = bestOf(input);
    expect(outcome).toBe(expected);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("most of the families are really about 1 MiB (the check is not made on a small file)", () => {
    const sizes = families.map(([, make]) => Buffer.byteLength(make()));
    expect(sizes.filter(size => size > 0.8 * MIB).length).toBeGreaterThanOrEqual(families.length * 0.7);
  });
});
