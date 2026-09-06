import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Inngest } from "inngest";

type JobOpts = {
  id?: string;
  triggers?: Array<{ event?: string }>;
};

function jobOpts(job: unknown): JobOpts {
  return (job as { opts: JobOpts }).opts;
}

describe("carousel slide job triggers", () => {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousImageJobTarget = process.env.IMAGE_JOB_TARGET;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousImageJobTarget === undefined) delete process.env.IMAGE_JOB_TARGET;
    else process.env.IMAGE_JOB_TARGET = previousImageJobTarget;
    vi.resetModules();
  });

  it("pins web and worker triggers when IMAGE_JOB_TARGET=worker at module load", async () => {
    process.env.IMAGE_JOB_TARGET = "worker";

    const {
      creativeWorkCarouselSlideJob,
      createCreativeWorkCarouselSlideJobV2,
    } = await import("./creative-work-carousel");

    expect(jobOpts(creativeWorkCarouselSlideJob).triggers).toEqual([
      { event: "creative-work.carousel-slide.generate" },
    ]);

    const createFunction = vi.fn((opts: JobOpts) => ({ opts }));
    createCreativeWorkCarouselSlideJobV2({ createFunction } as unknown as Inngest);
    expect(createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generate-creative-work-carousel-slide-v2",
        triggers: [{ event: "creative-work.carousel-slide.generate.v2" }],
      }),
      expect.anything(),
    );
  });

  it("keeps the worker job on the v2 event via factory", async () => {
    process.env.IMAGE_JOB_TARGET = "worker";

    const { createCreativeWorkCarouselSlideJobV2 } = await import("./creative-work-carousel");

    const createFunction = vi.fn((opts: JobOpts) => ({ opts }));
    createCreativeWorkCarouselSlideJobV2({ createFunction } as unknown as Inngest);
    expect(createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generate-creative-work-carousel-slide-v2",
        triggers: [{ event: "creative-work.carousel-slide.generate.v2" }],
      }),
      expect.anything(),
    );
  });
});
