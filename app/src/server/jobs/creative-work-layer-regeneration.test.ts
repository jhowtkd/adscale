import { describe, expect, it } from "vitest";
import { creativeWorkLayerRegenerationJob } from "./creative-work-layer-regeneration";
describe("creativeWorkLayerRegenerationJob", () => it("has zero automatic retries", () => expect(creativeWorkLayerRegenerationJob.id()).toBe("regenerate-creative-work-layer")));
