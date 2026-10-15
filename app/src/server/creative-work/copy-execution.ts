import type { CreativeWorkItem } from "../db/schema";
import { preparationInputFingerprint } from "./preparation-attempt";

/** Content validity is independent from autosave clocks and the paid unit's freeze key. */
export function independentCopyInputRevision(work: Pick<CreativeWorkItem,
  "clientProfileId" | "toolKind" | "format" | "request" | "settings" | "brief" | "inputSnapshot" | "copy"
>): string {
  return preparationInputFingerprint({
    clientProfileId: work.clientProfileId,
    toolKind: work.toolKind,
    format: work.format,
    request: work.request,
    settings: work.settings,
    brief: work.brief,
    factPack: work.inputSnapshot?.factPack ?? null,
    copy: work.copy,
  });
}
