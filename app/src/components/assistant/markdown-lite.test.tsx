import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

function mount(text: string) {
  return render(<div>{renderMarkdownLite(text)}</div>);
}

describe("renderMarkdownLite tables", () => {
  const basic = "| Canal | Papel |\n| --- | --- |\n| Site | Vitrine |\n| Instagram | Prova |";

  it("draws a real table with column headers and body rows", () => {
    mount(basic);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Canal", "Papel"]);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[2]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Instagram", "Prova"]);
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("scope", "col");
  });

  it("wraps the table in a focusable, horizontally scrollable region", () => {
    mount(basic);
    const wrapper = screen.getByTestId("markdown-table");
    expect(wrapper).toHaveAttribute("tabindex", "0");
    expect(wrapper.className).toContain("overflow-x-auto");
  });

  it("accepts rows without the outer pipes", () => {
    mount("A | B\n--- | ---\n1 | 2");
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "2"]);
  });

  it("turns the rule row into column alignment", () => {
    mount("| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |");
    const heads = screen.getAllByRole("columnheader");
    expect(heads.map((h) => ["text-left", "text-center", "text-right"].find((c) => h.className.split(" ").includes(c)))).toEqual(["text-left", "text-center", "text-right"]);
    const cells = screen.getAllByRole("cell");
    expect(cells[1]!.className.split(" ")).toContain("text-center");
    expect(cells[2]!.className.split(" ")).toContain("text-right");
  });

  it("reads \\| as a literal pipe inside a cell", () => {
    mount("| a | b |\n| --- | --- |\n| x \\| y | z |");
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["x | y", "z"]);
  });

  it("formats inline markdown inside cells", () => {
    const { container } = mount("| a | b |\n| --- | --- |\n| **bold** | *it* and `code` |");
    expect(container.querySelector("td strong")?.textContent).toBe("bold");
    expect(container.querySelector("td em")?.textContent).toBe("it");
    expect(container.querySelector("td code")?.textContent).toBe("code");
  });

  it("pads a short row with empty cells", () => {
    mount("| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |");
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "2", ""]);
  });

  it("ignores cells beyond the header's columns", () => {
    mount("| a | b |\n| --- | --- |\n| 1 | 2 | 3 | 4 |");
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "2"]);
  });

  it("draws a header-only table without a tbody", () => {
    const { container } = mount("| a | b |\n| --- | --- |");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(container.querySelector("tbody")).toBeNull();
    expect(container.querySelector("thead")).not.toBeNull();
  });

  it("keeps a header with no rule row as plain text", () => {
    const { container } = mount("| a | b |\nnext line");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("span.block")).toHaveLength(2);
  });

  it("keeps a header whose rule has another number of columns as plain text", () => {
    const { container } = mount("| a | b |\n| --- | --- | --- |\n| 1 | 2 |");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("span.block")).toHaveLength(3);
  });

  it("keeps pipes in prose as plain text", () => {
    const html = toBlockHtml(renderMarkdownLite("use a | b to choose\nand c | d too"));
    expect(html).not.toContain("<table");
    expect(html).toBe('<span class="block">use a | b to choose</span><span class="block">and c | d too</span>');
  });

  it("keeps the order of paragraphs and the table", () => {
    const { container } = mount("before\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter");
    const kids = Array.from(container.firstElementChild!.children);
    expect(kids.map((k) => (k.getAttribute("data-testid") === "markdown-table" ? "table" : k.textContent))).toEqual(["before", "table", "", "after"]);
  });

  it("draws two tables separated by a blank line", () => {
    const { container } = mount("| a |\n| --- |\n| 1 |\n\n| b |\n| --- |\n| 2 |");
    expect(container.querySelectorAll("table")).toHaveLength(2);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["a", "b"]);
  });

  it("ignores a last line made only of pipes (a row that has just begun)", () => {
    for (const tail of ["|", "| |", "|  |  |"]) {
      const { container, unmount } = mount(`| a | b |\n| --- | --- |\n| 1 | 2 |\n${tail}`);
      expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
      unmount();
    }
  });

  it("shows HTML in a cell as escaped text", () => {
    const { container } = mount("| a |\n| --- |\n| <img src=x onerror=alert(1)> |");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("cell").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("is safe for every prefix of a streamed message and the full text is a complete table", () => {
    const full = "Intro paragraph\n\n| Canal | Papel | Prioridade | Nota |\n| :--- | :---: | ---: | --- |\n| Site | Vitrine | Alta | **fixo** |\n| Instagram | Prova | Média | a \\| b |\n\nClosing paragraph";
    for (let n = 0; n <= full.length; n += 1) {
      const prefix = full.slice(0, n);
      const { container, unmount } = render(<div>{renderMarkdownLite(prefix)}</div>);
      const heads = container.querySelectorAll("thead th").length;
      container.querySelectorAll("tbody tr").forEach((tr) => expect(tr.querySelectorAll("td").length).toBe(heads));
      expect(container.querySelector("table") === null || heads === 4).toBe(true);
      if (n === full.length) {
        expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
        expect(container.textContent).toContain("a | b");
        expect(container.textContent).toContain("Closing paragraph");
      }
      unmount();
    }
  });

  it("leaves text without tables identical to before (one block span per line)", () => {
    expect(toBlockHtml(renderMarkdownLite("a\n\nb"))).toBe('<span class="block">a</span><span class="block"></span><span class="block">b</span>');
  });
});
