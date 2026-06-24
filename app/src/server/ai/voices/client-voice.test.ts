import { describe, it, expect } from "vitest";
import {
  resolveClientVoice,
  buildClientVoicePromptSection,
} from "./client-voice";
import { CENBRAP_VOICE } from "./cenbrap";

describe("deprecated resolveClientVoice", () => {
  it("returns Cenbrap voice when client is CENBRAP", () => {
    expect(resolveClientVoice({ client: "CENBRAP" })).toBe(CENBRAP_VOICE);
  });

  it("returns Cenbrap voice when name is Cenbrap em Dobro", () => {
    expect(resolveClientVoice({ name: "Cenbrap em Dobro" })).toBe(CENBRAP_VOICE);
  });

  it("returns Cenbrap voice for imersao nr1 campaign name", () => {
    expect(resolveClientVoice({ name: "Imersão NR1" })).toBe(CENBRAP_VOICE);
  });

  it("returns null for unknown clients without throwing", () => {
    expect(resolveClientVoice({ client: "Acme Corp" })).toBeNull();
    expect(resolveClientVoice({ name: "Random campaign" })).toBeNull();
    expect(resolveClientVoice({})).toBeNull();
  });
});

describe("buildClientVoicePromptSection", () => {
  it("returns no section for null voice", () => {
    expect(buildClientVoicePromptSection(null)).toEqual([]);
  });

  it("returns prompt lines for Cenbrap voice", () => {
    const section = buildClientVoicePromptSection(CENBRAP_VOICE);
    expect(section.length).toBeGreaterThan(0);
  });

  it("includes authority, education, professors, claims caution, invite rhythm and anti-template guidance", () => {
    const joined = buildClientVoicePromptSection(CENBRAP_VOICE).join("\n").toLowerCase();

    expect(joined).toMatch(/authority|autoridade|education|educa/);
    expect(joined).toMatch(/professor|people|pessoa/);
    expect(joined).toMatch(/mec|certif|claim|autoridade/);
    expect(joined).toMatch(/invite|convite|rhythm|ritmo/);
    expect(joined).toMatch(/template|generic|genérico|anti/);
  });

  it("does not prescribe a fixed layout template", () => {
    const joined = buildClientVoicePromptSection(CENBRAP_VOICE).join("\n").toLowerCase();

    expect(joined).not.toMatch(/always use.*grid|sempre usar.*grade|use this layout/);
    expect(joined).not.toMatch(/three-zone|three zone/);
    expect(joined).toMatch(/no fixed layout prescription|does not prescribe/);
  });
});
