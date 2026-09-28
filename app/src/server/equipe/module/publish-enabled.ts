// Publication kill switch (#548): EQUIPE_PUBLISH_ENABLED. Off (the default)
// sends nothing — due intents stay held. Fails closed on any other value.

import { env } from "../../validation/env";

export type PublishEnabledOverrides = {
  enabledRaw?: string | undefined;
};

export function isEquipePublishEnabled(overrides?: PublishEnabledOverrides): boolean {
  const enabledRaw = overrides?.enabledRaw ?? env.EQUIPE_PUBLISH_ENABLED;
  return enabledRaw === "true";
}
