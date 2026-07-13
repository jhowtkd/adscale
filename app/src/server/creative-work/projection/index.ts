import { projectCampaignAsCanonicalWork } from "./from-campaign";
import { projectCreativeWorkAsCanonicalWork } from "./from-creative-work";
import type { CanonicalCreativeWork } from "@/server/creative-work/canonical/types";
import type { CampaignProjectionSource, DerivationProjectionSource } from "./from-campaign";
import type {
  CreativeWorkOutputProjectionSource,
  CreativeWorkProjectionSource,
} from "./from-creative-work";

export {
  projectCampaignAsCanonicalWork,
  summarizeCampaignAsCanonicalWork,
} from "./from-campaign";
export {
  projectCreativeWorkAsCanonicalWork,
  summarizeCreativeWorkAsCanonicalWork,
} from "./from-creative-work";

export type ProjectionOriginInput =
  | {
      originKind: "campaign";
      campaign: CampaignProjectionSource;
      derivations?: DerivationProjectionSource[];
    }
  | {
      originKind: "creative_work";
      work: CreativeWorkProjectionSource;
      outputs?: CreativeWorkOutputProjectionSource[];
    };

/** Dispatch projection by origin without touching persistence. */
export function projectAsCanonicalWork(
  input: ProjectionOriginInput
): CanonicalCreativeWork {
  if (input.originKind === "campaign") {
    return projectCampaignAsCanonicalWork(
      input.campaign,
      input.derivations ?? []
    );
  }
  return projectCreativeWorkAsCanonicalWork(input.work, input.outputs ?? []);
}
