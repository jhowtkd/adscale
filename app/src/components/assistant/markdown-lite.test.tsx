import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  escapeMarkdownText,
  parseInlineMarkdown,
  renderInlineMarkdown,
  renderMarkdownLite,
} from "./markdown-lite";

function toHtml(node: ReturnType<typeof renderInlineMarkdown>): string {
  return renderToStaticMarkup(<>{node}</>);
}

function toBlockHtml(node: ReturnType<typeof renderMarkdownLite>): string {
  return renderToStaticMarkup(<>{node}</>);
}

describe("escapeMarkdownText", () => {
  it("escapes HTML metacharacters so content cannot inject markup", () => {
    expect(escapeMarkdownText(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(escapeMarkdownText(`a & b`)).toBe("a &amp; b");
    expect(escapeMarkdownText(`it's fine`)).toBe("it&#39;s fine");
  });
});

describe("parseInlineMarkdown", () => {
  it("leaves plain text untouched as a single text token", () => {
    expect(parseInlineMarkdown("hello world")).toEqual([
      { kind: "text", value: "hello world" },
    ]);
  });

  it("parses **bold** into a bold token", () => {
    const tokens = parseInlineMarkdown("hello **world**!");
    expect(tokens).toEqual([
      { kind: "text", value: "hello " },
      { kind: "bold", value: [{ kind: "text", value: "world" }] },
      { kind: "text", value: "!" },
    ]);
  });

  it("parses *italic* into an italic token", () => {
    const tokens = parseInlineMarkdown("a *b* c");
    expect(tokens).toEqual([
      { kind: "text", value: "a " },
      { kind: "italic", value: [{ kind: "text", value: "b" }] },
      { kind: "text", value: " c" },
    ]);
  });

  it("parses `inline code` into a code token", () => {
    const tokens = parseInlineMarkdown("run `npm test` now");
    expect(tokens).toEqual([
      { kind: "text", value: "run " },
      { kind: "code", value: "npm test" },
      { kind: "text", value: " now" },
    ]);
  });

  it("leaves unclosed markers as literal text", () => {
    expect(parseInlineMarkdown("a ** b")).toEqual([
      { kind: "text", value: "a ** b" },
    ]);
    expect(parseInlineMarkdown("a ` b")).toEqual([
      { kind: "text", value: "a ` b" },
    ]);
  });
});

describe("renderInlineMarkdown", () => {
  it("renders bold, italic, and code spans", () => {
    const html = toHtml(renderInlineMarkdown("**b** *i* `c`"));
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<em>i</em>");
    expect(html).toMatch(/<code[^>]*>c<\/code>/);
  });

  it("escapes HTML inside text spans (no raw markup injected)", () => {
    const html = toHtml(renderInlineMarkdown("<img src=x>"));
    // React auto-escapes string children, so the literal <img never appears
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x&gt;");
  });
});

describe("renderMarkdownLite", () => {
  it("splits on newlines into separate line spans", () => {
    const html = toBlockHtml(renderMarkdownLite("line1\nline2"));
    expect(html).toContain('<span class="block">line1</span>');
    expect(html).toContain('<span class="block">line2</span>');
  });

  it("preserves inline formatting across line breaks", () => {
    const html = toBlockHtml(renderMarkdownLite("**bold**\n*italic*"));
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });
});
