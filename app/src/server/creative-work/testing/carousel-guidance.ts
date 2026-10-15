import { getCarouselEditorialFixedPrompts } from "../carousel-editorial";
import { carouselResearchPolicy } from "../../shared-skills-texts";
import { getCreativeWorkPromptVersion } from "../../shared-skills";
import type { FrozenCarouselGuidanceCycle } from "../../brand-taste/carousel-guidance-cycle";

/** Empty trusted freeze for tests which replace persistence/model orchestration. */
export function emptyCarouselGuidanceFixture(): FrozenCarouselGuidanceCycle {
  const empty = { lines: [], appliedRefs: [], setHash: null, omissions: [] };
  return { version: 1, cycleId: "10000000-0000-4000-8000-000000000001", parentCycleId: null,
    requestKey: "request", contextFingerprint: "context", clientProfileId: "profile-1", format: "4:5",
    editorial: getCarouselEditorialFixedPrompts(), imagePromptVersion: getCreativeWorkPromptVersion("image_prompt"),
    research: { withExternalEvidence: carouselResearchPolicy(true), withoutExternalEvidence: carouselResearchPolicy(false), fixedPromptVersion: getCreativeWorkPromptVersion() },
    selections: { carousel_editorial: empty, image_prompt: empty } };
}
