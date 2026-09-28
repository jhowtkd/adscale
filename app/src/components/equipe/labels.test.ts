import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eventTypeLabel } from "./labels";

const MESSAGE_FILES = ["../../../messages/pt-BR.json", "../../../messages/en.json"] as const;

function readMessages(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
}

function dottedKeys(value: unknown, path: string, out: string[]): void {
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key.includes(".")) out.push(path === "" ? key : `${path}.${key}`);
    dottedKeys(child, path === "" ? key : `${path}.${key}`, out);
  }
}

describe("equipe message keys", () => {
  it("has no dotted keys in any message file (next-intl forbids them)", () => {
    for (const file of MESSAGE_FILES) {
      const violations: string[] = [];
      dottedKeys(readMessages(file), "", violations);
      expect(violations, `${file} keys with a dot`).toEqual([]);
    }
  });

  it("keeps every event type label under its escaped key", () => {
    for (const file of MESSAGE_FILES) {
      const messages = readMessages(file) as {
        equipe: { labels: { eventType: Record<string, unknown> } };
      };
      const eventType = messages.equipe.labels.eventType;
      for (const raw of ["escalation.opened", "pause.applied", "support_exception.closed"]) {
        const escaped = raw.replaceAll(".", "__");
        expect(
          typeof eventType[escaped] === "string" && eventType[escaped] !== "",
          `${file} equipe.labels.eventType.${escaped}`,
        ).toBe(true);
      }
    }
  });
});

describe("eventTypeLabel", () => {
  it("escapes dots before looking the label up", () => {
    const seen: string[] = [];
    const label = eventTypeLabel((key) => {
      seen.push(key);
      return "Escalonamento aberto";
    }, "escalation.opened");
    expect(seen).toEqual(["eventType.escalation__opened"]);
    expect(label).toBe("Escalonamento aberto");
  });

  it("falls back to the raw type for unknown types", () => {
    expect(eventTypeLabel(() => "", "billing.refunded")).toBe("billing.refunded");
    expect(
      eventTypeLabel(() => {
        throw new Error("missing");
      }, "billing.refunded"),
    ).toBe("billing.refunded");
  });
});
