import { describe, expect, it, vi } from "vitest";
import type { Inngest } from "inngest";
import {
  createCreativeWorkCarouselSlideJobV2,
  creativeWorkCarouselSlideJob,
} from "./creative-work-carousel";

type JobOpts = {
  id?: string;
  triggers?: Array<{ event?: string }>;
};

function jobOpts(job: unknown): JobOpts {
  return (job as { opts: JobOpts }).opts;
}

describe("carousel slide job triggers", () => {
  it("keeps the web job on the unsuffixed event", () => {
    expect(jobOpts(creativeWorkCarouselSlideJob).triggers).toEqual([
      { event: "creative-work.carousel-slide.generate" },
    ]);
  });

  it("keeps the worker job on the v2 event even if IMAGE_JOB_TARGET is worker", () => {
    const previous = process.env.IMAGE_JOB_TARGET;
    process.env.IMAGE_JOB_TARGET = "worker";
    try {
      const createFunction = vi.fn((opts: JobOpts) => ({ opts }));
      createCreativeWorkCarouselSlideJobV2({ createFunction } as unknown as Inngest);
      expect(createFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "generate-creative-work-carousel-slide-v2",
          triggers: [{ event: "creative-work.carousel-slide.generate.v2" }],
        }),
        expect.anything(),
      );
    } finally {
      if (previous === undefined) delete process.env.IMAGE_JOB_TARGET;
      else process.env.IMAGE_JOB_TARGET = previous;
    }
  });
});
