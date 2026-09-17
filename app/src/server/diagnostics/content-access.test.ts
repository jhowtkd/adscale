import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  DIAGNOSTIC_CONTENT_POLICY_VERSION,
  __resetContentPolicyForTests,
} from "./content-policy";
import type { DiagnosticDatabase } from "./journal";
import {
  CONTENT_ACCESS_AUDIT_ACTION,
  ContentAccessAuditError,
  probeContentAccessPath,
  readDiagnosticContent,
  recordContentAccessAudit,
  type DiagnosticContentMetadata,
  type ReadDiagnosticContentInput,
} from "./content-access";

const WS = "ws-access-1";
const CANARY = "CANARY-PROMPT-391-Z9Q";

function redactedPolicyDeps() {
  return {
    policyDeps: {
      env: {
        OBSERVABILITY_CONTENT_MODE: "redacted",
        OBSERVABILITY_WORKSPACE_ALLOWLIST: WS,
      } as NodeJS.ProcessEnv,
      verifyAccess: async () => true,
      verifyDeletion: async () => true,
    },
  };
}

const METADATA: DiagnosticContentMetadata = {
  callId: "call-1",
  provider: "openai",
  requestedModel: "gpt-5.6-sol",
  returnedModel: "gpt-5.6-sol",
  providerRequestId: "req-1",
  latencyMs: 120,
  inputTokens: 12,
  outputTokens: 34,
};

function readInput(overrides?: Partial<ReadDiagnosticContentInput>) {
  return {
    operatorId: "op-1",
    scope: "platform-owner",
    workspaceId: WS,
    workItemId: "work-1",
    callId: "call-1",
    reason: "incident investigation",
    occurredAt: new Date().toISOString(),
    metadata: { ...METADATA },
    ...overrides,
  };
}

/** Minimal drizzle-insert stub: captures the row, returns an id. */
function stubDatabase(options?: {
  fail?: Error;
  onInsert?: (row: unknown) => void;
}): { database: DiagnosticDatabase; inserts: unknown[] } {
  const inserts: unknown[] = [];
  const database = {
    insert: vi.fn(() => ({
      values: vi.fn((row: unknown) => {
        inserts.push(row);
        options?.onInsert?.(row);
        return {
          returning: vi.fn(async () => {
            if (options?.fail) throw options.fail;
            return [{ id: `audit-${inserts.length}` }];
          }),
        };
      }),
    })),
  } as unknown as DiagnosticDatabase;
  return { database, inserts };
}

beforeEach(() => {
  __resetContentPolicyForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordContentAccessAudit (#391)", () => {
  const entry = {
    operatorId: "op-1",
    scope: "platform-owner",
    workspaceId: WS,
    workItemId: "work-1",
    resource: "call:call-1",
    action: CONTENT_ACCESS_AUDIT_ACTION,
    reason: "incident investigation",
    result: "allowed" as const,
  };

  it("writes operator/scope/time/resource/purpose rows with no content field", async () => {
    const { database, inserts } = stubDatabase();
    const { id } = await recordContentAccessAudit(entry, database);
    expect(id).toBe("audit-1");
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      operatorId: "op-1",
      scope: "platform-owner",
      workspaceId: WS,
      workItemId: "work-1",
      resource: "call:call-1",
      action: CONTENT_ACCESS_AUDIT_ACTION,
      reason: "incident investigation",
      result: "allowed",
    });
    expect("content" in row).toBe(false);
    expect("prompt" in row).toBe(false);
    expect("payload" in row).toBe(false);
  });

  it("rejects invalid entries without touching the database", async () => {
    const { database } = stubDatabase();
    await expect(
      recordContentAccessAudit({ ...entry, operatorId: "  " }, database),
    ).rejects.toBeInstanceOf(ContentAccessAuditError);
    await expect(
      recordContentAccessAudit({ ...entry, reason: "" }, database),
    ).rejects.toBeInstanceOf(ContentAccessAuditError);
    await expect(
      recordContentAccessAudit(
        { ...entry, result: "maybe" as "allowed" },
        database,
      ),
    ).rejects.toBeInstanceOf(ContentAccessAuditError);
    expect(
      (database.insert as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
  });

  it("propagates storage failures to the caller (the read path denies)", async () => {
    const { database } = stubDatabase({ fail: new Error("db down") });
    await expect(recordContentAccessAudit(entry, database)).rejects.toThrow(
      "db down",
    );
  });
});

describe("readDiagnosticContent (#391)", () => {
  it("audits and serves sanitized content in redacted mode", async () => {
    const { database, inserts } = stubDatabase();
    const result = await readDiagnosticContent(
      readInput({ content: { text: `prompt ${CANARY} with api_key=hunter2` } }),
      { database, ...redactedPolicyDeps() },
    );
    expect(result.allowed).toBe(true);
    expect(result.auditId).toBe("audit-1");
    expect(result.availability).toBe("redacted");
    expect(result.policyVersion).toBe(DIAGNOSTIC_CONTENT_POLICY_VERSION);
    expect(result.metadata).toEqual(METADATA);
    expect(result.content?.verbatim).toBe(false);
    expect(JSON.stringify(result.content?.payload)).not.toContain("hunter2");
    // The audit row carries attribution only — the prompt canary never lands.
    expect(inserts).toHaveLength(1);
    expect(JSON.stringify(inserts[0])).not.toContain(CANARY);
    expect(JSON.stringify(inserts[0])).not.toContain("hunter2");
    expect(inserts[0]).toMatchObject({
      operatorId: "op-1",
      scope: "platform-owner",
      resource: "call:call-1",
      reason: "incident investigation",
      result: "allowed",
    });
  });

  it("denies the read when the audit write fails; metadata stays readable", async () => {
    const { database } = stubDatabase({ fail: new Error("db down") });
    const result = await readDiagnosticContent(
      readInput({ content: { text: "secret prompt" } }),
      { database, ...redactedPolicyDeps() },
    );
    expect(result.allowed).toBe(false);
    expect(result.auditId).toBeNull();
    expect(result.content).toBeNull();
    expect(result.metadata).toEqual(METADATA);
  });

  it("withholds content as not_collected in metadata_only mode, still audited", async () => {
    const { database, inserts } = stubDatabase();
    const result = await readDiagnosticContent(
      readInput({ content: { text: CANARY } }),
      { database, policyDeps: { env: {} } },
    );
    expect(result.allowed).toBe(true);
    expect(result.availability).toBe("not_collected");
    expect(result.content).toBeNull();
    expect(result.metadata).toEqual(METADATA);
    expect(inserts).toHaveLength(1);
    expect(JSON.stringify(inserts[0])).not.toContain(CANARY);
  });

  it("reports expired content without ever reconstructing it", async () => {
    const { database } = stubDatabase();
    const result = await readDiagnosticContent(
      readInput({
        content: { text: CANARY },
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
      { database, ...redactedPolicyDeps() },
    );
    expect(result.allowed).toBe(true);
    expect(result.availability).toBe("expired");
    expect(result.content).toBeNull();
    expect(result.metadata).toEqual(METADATA);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("marks content unavailable on remote outage; metadata stays", async () => {
    const { database } = stubDatabase();
    const result = await readDiagnosticContent(
      readInput({ content: { text: CANARY } }),
      { database, remoteReachable: false, ...redactedPolicyDeps() },
    );
    expect(result.allowed).toBe(true);
    expect(result.availability).toBe("unavailable");
    expect(result.content).toBeNull();
    expect(result.metadata).toEqual(METADATA);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("drops content but keeps metadata when sanitization fails", async () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("prototype boom");
        },
      },
    );
    const { database } = stubDatabase();
    const result = await readDiagnosticContent(
      readInput({ content: hostile }),
      { database, ...redactedPolicyDeps() },
    );
    expect(result.allowed).toBe(true);
    expect(result.availability).toBe("unavailable");
    expect(result.content).toBeNull();
    expect(result.metadata).toEqual(METADATA);
  });

  it("reports not_collected when redacted mode has no content", async () => {
    const { database } = stubDatabase();
    const result = await readDiagnosticContent(readInput(), {
      database,
      ...redactedPolicyDeps(),
    });
    expect(result.allowed).toBe(true);
    expect(result.availability).toBe("not_collected");
    expect(result.content).toBeNull();
  });

  it("rejects unattributed reads without touching content or audit", async () => {
    const { database } = stubDatabase();
    await expect(
      readDiagnosticContent(readInput({ operatorId: "" }), {
        database,
        ...redactedPolicyDeps(),
      }),
    ).rejects.toBeInstanceOf(ContentAccessAuditError);
    await expect(
      readDiagnosticContent(readInput({ reason: "  " }), {
        database,
        ...redactedPolicyDeps(),
      }),
    ).rejects.toBeInstanceOf(ContentAccessAuditError);
    expect(
      (database.insert as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
  });
});

describe("probeContentAccessPath (#391)", () => {
  it("returns false without throwing when the audit path is broken", async () => {
    const { database } = stubDatabase({ fail: new Error("db down") });
    await expect(probeContentAccessPath(WS, database)).resolves.toBe(false);
  });

  it("returns false for blank workspace ids without touching the database", async () => {
    const { database } = stubDatabase();
    await expect(probeContentAccessPath("  ", database)).resolves.toBe(false);
    expect(
      (database.insert as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
  });
});
