import { describe, expect, it } from "vitest";
import { templateComposerHref } from "./page";

describe("templateComposerHref", () => {
  it("opens the template directly in the focused home composer", () => {
    expect(
      templateComposerHref("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    ).toBe(
      "/?templateId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&compose=1"
    );
  });
});
