import { describe, expect, it } from "vitest";
import { publishCreativeWorkLayerEditor } from "./publish-creative-work-layer-editor";
describe("publishCreativeWorkLayerEditor", () => {
  it("exposes the idempotent publication command", () => expect(typeof publishCreativeWorkLayerEditor).toBe("function"));
});
