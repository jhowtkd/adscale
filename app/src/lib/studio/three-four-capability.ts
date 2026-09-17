import type {
  CreativeWorkFormat,
  CreativeWorkIntent,
} from "@/server/creative-work/contracts";

/**
 * 3:4 creation capability (ICE-04B). Client-safe: the composer derives the
 * offered option list from these same functions the server gates enforce,
 * so the interface never presents 3:4 where creation would be refused —
 * and never hides it where creation is authorized.
 *
 * Two independent conditions: the creation switch (web/worker enablement)
 * and the protocol validation map. Only exercised protocols offer 3:4; an
 * unvalidated protocol hides/blocks it explicitly instead of faking
 * universal coverage. Reads, downloads and finishing existing 3:4 works
 * never consult this module.
 */

/** Protocols with an exercised 3:4 path (single piece, format adaptation). */
export const THREE_FOUR_CREATION_PROTOCOLS: readonly CreativeWorkIntent[] = [
  "single",
  "format_adaptation",
];

const ALWAYS_CREATABLE_FORMATS: readonly CreativeWorkFormat[] = ["1:1", "4:5", "9:16"];

export function threeFourCreationOffered(input: {
  creationSwitch: string | undefined;
  intent: CreativeWorkIntent;
}): boolean {
  if (input.creationSwitch !== "true") return false;
  return (THREE_FOUR_CREATION_PROTOCOLS as readonly string[]).includes(input.intent);
}

export type ThreeFourCreationBlock =
  | { code: "format_creation_disabled"; format: string }
  | { code: "format_protocol_unsupported"; format: string };

/**
 * Null when the requested formats may be created; otherwise the first
 * 3:4 format with its distinct block reason. Previous formats always pass.
 */
export function threeFourCreationBlock(input: {
  format: string;
  targetFormats: readonly string[];
  intent: CreativeWorkIntent;
  creationSwitch: string | undefined;
}): ThreeFourCreationBlock | null {
  const requested = [input.format, ...input.targetFormats];
  const blocked = requested.find((format) => format === "3:4");
  if (!blocked) return null;
  if (input.creationSwitch !== "true") {
    return { code: "format_creation_disabled", format: blocked };
  }
  if (!(THREE_FOUR_CREATION_PROTOCOLS as readonly string[]).includes(input.intent)) {
    return { code: "format_protocol_unsupported", format: blocked };
  }
  return null;
}

/** Studio option list for the current protocol: 3:4 appended only when offered. */
export function offeredStudioFormats(input: {
  creationSwitch: string | undefined;
  intent: CreativeWorkIntent;
}): readonly CreativeWorkFormat[] {
  if (!threeFourCreationOffered(input)) return ALWAYS_CREATABLE_FORMATS;
  return [...ALWAYS_CREATABLE_FORMATS, "3:4"];
}
