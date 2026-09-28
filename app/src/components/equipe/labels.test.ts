import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  actorLabel,
  authorRoleLabel,
  enumLabel,
  eventTypeLabel,
  payloadFacts,
  shortId,
  shortenUuids,
  staffRoleLabel,
} from "./labels";

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
      for (const raw of [
        "escalation.opened",
        "pause.applied",
        "support_exception.closed",
        "quality.effort_recorded",
        "escalation.sla_breached",
      ]) {
        const escaped = raw.replaceAll(".", "__");
        expect(
          typeof eventType[escaped] === "string" && eventType[escaped] !== "",
          `${file} equipe.labels.eventType.${escaped}`,
        ).toBe(true);
      }
    }
  });

  it("translates every staff-facing vocabulary in both languages", () => {
    const expected: Record<string, string[]> = {
      staffRole: ["support", "quality", "operations"],
      agentRole: [
        "strategist",
        "research",
        "writer",
        "reviewer_text",
        "reviewer_visual",
        "measurement",
      ],
      connectionStatus: ["active", "expired", "revoked", "error"],
      payloadKey: [
        "cause",
        "exit",
        "reason",
        "lessonCandidate",
        "summary",
        "note",
        "channel",
        "connectionId",
        "from",
        "to",
      ],
    };
    for (const file of MESSAGE_FILES) {
      const messages = readMessages(file) as {
        equipe: { labels: Record<string, Record<string, unknown>> };
      };
      for (const [group, keys] of Object.entries(expected)) {
        for (const key of keys) {
          expect(
            typeof messages.equipe.labels[group]?.[key] === "string" &&
              messages.equipe.labels[group]?.[key] !== "",
            `${file} equipe.labels.${group}.${key}`,
          ).toBe(true);
        }
      }
    }
  });

  it("covers the quality effort form, the close summary and its errors", () => {
    for (const file of MESSAGE_FILES) {
      const messages = readMessages(file) as {
        equipe: {
          quality: Record<string, unknown>;
          round: Record<string, unknown>;
          staffErrors: Record<string, unknown>;
        };
      };
      for (const key of [
        "effortToggle",
        "effortTitle",
        "effortMinutes",
        "effortNote",
        "effortSubmit",
        "effortDone",
        "effortInvalid",
      ]) {
        expect(typeof messages.equipe.quality[key], `${file} equipe.quality.${key}`).toBe(
          "string",
        );
      }
      for (const key of ["summaryOutcome", "summaryDecisions", "summaryItem", "summaryScore"]) {
        expect(typeof messages.equipe.round[key], `${file} equipe.round.${key}`).toBe("string");
      }
      expect(typeof messages.equipe.staffErrors.roundNotInFront, file).toBe("string");
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

const MESSAGES: Record<string, string> = {
  "actorType.agent": "IA",
  "actorType.system": "Sistema",
  "actorType.staff": "Equipe",
  "actorType.client_person": "Cliente",
  "staffRole.support": "atendimento",
  "staffRole.quality": "qualidade",
  "staffRole.operations": "operação",
  "agentRole.writer": "redação",
  "agentRole.strategist": "estrategista",
  "cause.model_error": "Erro de modelo",
  "exit.fix": "Corrigir",
  "channel.whatsapp": "WhatsApp",
  "closeReason.resolved": "Resolvida",
  "classification.fact": "fato",
  "classification.taste": "gosto",
  "payloadKey.reason": "Motivo",
  "payloadKey.exit": "Decisão",
  "payloadKey.cause": "Causa",
  "payloadKey.channel": "Canal",
  "payloadKey.connectionId": "Conexão",
  "payloadKey.from": "De",
  "payloadKey.to": "Para",
};

function translate(key: string): string {
  const value = MESSAGES[key];
  if (value === undefined) throw new Error(`missing: ${key}`);
  return value;
}

describe("staffRoleLabel", () => {
  it("translates the three staff roles", () => {
    expect(staffRoleLabel(translate, "support")).toBe("atendimento");
    expect(staffRoleLabel(translate, "quality")).toBe("qualidade");
    expect(staffRoleLabel(translate, "operations")).toBe("operação");
  });

  it("renders unknown roles raw, never a key path", () => {
    expect(staffRoleLabel(translate, "finance")).toBe("finance");
  });
});

describe("actorLabel", () => {
  it("reads the AI and the system bare, without ids", () => {
    expect(actorLabel(translate, { actorType: "agent", actorRole: null, actorId: "agent-1" })).toBe(
      "IA",
    );
    expect(
      actorLabel(translate, {
        actorType: "system",
        actorRole: null,
        actorId: "run_deadlines",
      }),
    ).toBe("Sistema");
  });

  it("reads staff as the translated role plus a short id", () => {
    expect(
      actorLabel(translate, {
        actorType: "staff",
        actorRole: "quality",
        actorId: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).toBe("qualidade · 550e8400");
  });

  it("reads clients as the kind plus a short id", () => {
    expect(
      actorLabel(translate, {
        actorType: "client_person",
        actorRole: "approver",
        actorId: "550e8400-e29b-41d4-a716-446655440009",
      }),
    ).toBe("Cliente · 550e8400");
  });

  it("falls back to the kind label for staff without a known role", () => {
    expect(actorLabel(translate, { actorType: "staff", actorRole: null, actorId: null })).toBe(
      "Equipe",
    );
  });
});

describe("authorRoleLabel", () => {
  it("translates staff roles, agent roles and bare kinds", () => {
    expect(authorRoleLabel(translate, "quality")).toBe("qualidade");
    expect(authorRoleLabel(translate, "writer")).toBe("redação");
    expect(authorRoleLabel(translate, "agent")).toBe("IA");
    expect(authorRoleLabel(translate, "client_person")).toBe("Cliente");
  });

  it("renders unknown authors raw", () => {
    expect(authorRoleLabel(translate, "ghostwriter")).toBe("ghostwriter");
  });
});

describe("payloadFacts", () => {
  it("renders payloads as readable sentences with translated values", () => {
    expect(
      payloadFacts(translate, {
        reason: "alegação de saúde sem fonte no criativo",
        exit: "fix",
        channel: "whatsapp",
      }),
    ).toEqual([
      "Decisão: Corrigir",
      "Motivo: alegação de saúde sem fonte no criativo",
      "Canal: WhatsApp",
    ]);
  });

  it("translates enum-ish values and shortens ids", () => {
    expect(
      payloadFacts(translate, {
        cause: "model_error",
        connectionId: "550e8400-e29b-41d4-a716-446655440002",
        from: "fact",
        to: "taste",
        reason: "resolved",
      }),
    ).toEqual([
      "Causa: Erro de modelo",
      "Motivo: Resolvida",
      "Conexão: 550e8400",
      "De: fato",
      "Para: gosto",
    ]);
  });

  it("keeps free text as prose and skips missing keys", () => {
    expect(payloadFacts(translate, { note: undefined, summary: null })).toEqual([]);
    expect(payloadFacts(translate, null)).toEqual([]);
    expect(
      payloadFacts(translate, {
        reason: "escalation 550e8400-e29b-41d4-a716-446655440030: sem fonte",
      }),
    ).toEqual(["Motivo: escalation 550e8400: sem fonte"]);
  });
});

describe("shortId and shortenUuids", () => {
  it("shortens ids and embedded uuids", () => {
    expect(shortId("550e8400-e29b-41d4-a716-446655440030")).toBe("550e8400");
    expect(enumLabel(translate, "staffRole.quality")).toBe("qualidade");
    expect(shortenUuids("no ids here")).toBe("no ids here");
    expect(
      shortenUuids("escalation 550e8400-e29b-41d4-a716-446655440030: motivo"),
    ).toBe("escalation 550e8400: motivo");
  });
});
