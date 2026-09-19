/**
 * trace-391: audited content reads against real Postgres.
 *
 * Audit durability criteria — a real row with operator/scope/time/resource/
 * purpose and no prompt text, deny-on-audit-failure against a genuinely
 * unreachable database, and the access probe round-trip — are proven here,
 * never with mocks. Deny-path unit logic lives in content-access.test.ts.
 *
 * Requires a migrated test database (migration 0109):
 *   DATABASE_URL=postgres://<user>@localhost:5432/adscale_test npm test -- src/server/diagnostics/content-access.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "../db";
import * as schema from "../db/schema";
import { diagnosticAccessAudit } from "../db/schema";
import { __resetContentPolicyForTests } from "./content-policy";
import {
  CONTENT_ACCESS_AUDIT_ACTION,
  probeContentAccessPath,
  readDiagnosticContent,
  recordContentAccessAudit,
} from "./content-access";

const RUN_ID = `391a-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const WS_PREFIX = `ws-391a-${RUN_ID}`;
let seq = 0;

function ids(tag: string) {
  seq += 1;
  return {
    operatorId: `op-391a-${RUN_ID}-${tag}-${seq}`,
    workspaceId: `${WS_PREFIX}-${tag}`,
    workItemId: `work-391a-${RUN_ID}-${tag}-${seq}`,
    callId: `call-391a-${RUN_ID}-${tag}-${seq}`,
  };
}

const CANARY = `CANARY-PROMPT-391A-${RUN_ID}`;

beforeAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  try {
    await db.execute(sql`select 1 from adscale_app.diagnostic_access_audit limit 0`);
  } catch (err) {
    throw new Error(
      `[content-access.pg] Postgres de teste INACESSÍVEL ou sem a 0109 ` +
        `(DATABASE_URL=${process.env.DATABASE_URL ?? "(não definida)"}). ` +
        `Aplique drizzle/0109_diagnostic_journal.sql. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

afterAll(async () => {
  __resetContentPolicyForTests();
  vi.restoreAllMocks();
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  await db
    .delete(diagnosticAccessAudit)
    .where(like(diagnosticAccessAudit.workspaceId, `${WS_PREFIX}%`));
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "content access audit (real Postgres)",
  () => {
    it("writes a real audit row with operator/scope/time/resource/purpose", async () => {
      const scope = ids("row");
      const before = Date.now();
      const { id } = await recordContentAccessAudit({
        ...scope,
        scope: "platform-owner",
        resource: `call:${scope.callId}`,
        action: CONTENT_ACCESS_AUDIT_ACTION,
        reason: "incident investigation",
        result: "allowed",
      });
      const rows = await db
        .select()
        .from(diagnosticAccessAudit)
        .where(eq(diagnosticAccessAudit.id, id));
      expect(rows).toHaveLength(1);
      expect(rows[0].operatorId).toBe(scope.operatorId);
      expect(rows[0].scope).toBe("platform-owner");
      expect(rows[0].workspaceId).toBe(scope.workspaceId);
      expect(rows[0].workItemId).toBe(scope.workItemId);
      expect(rows[0].resource).toBe(`call:${scope.callId}`);
      expect(rows[0].action).toBe(CONTENT_ACCESS_AUDIT_ACTION);
      expect(rows[0].reason).toBe("incident investigation");
      expect(rows[0].result).toBe("allowed");
      // Server-clock timestamp: valid and recent within clock-skew
      // tolerance (the test DB clock runs ~3h behind this runner).
      expect(rows[0].occurredAt).toBeInstanceOf(Date);
      expect(
        Math.abs(rows[0].occurredAt.getTime() - before),
      ).toBeLessThan(24 * 3600_000);
    });

    it("audits a real redacted read without persisting the prompt", async () => {
      const scope = ids("read");
      const result = await readDiagnosticContent(
        {
          operatorId: scope.operatorId,
          scope: "platform-owner",
          workspaceId: scope.workspaceId,
          workItemId: scope.workItemId,
          callId: scope.callId,
          reason: "incident investigation",
          occurredAt: new Date().toISOString(),
          content: { text: `investigate ${CANARY} with api_key=hunter2` },
          metadata: {
            callId: scope.callId,
            provider: "openai",
            requestedModel: "gpt-5.6-sol",
            returnedModel: "gpt-5.6-sol",
            providerRequestId: "req-1",
            inputTokens: 12,
            outputTokens: 34,
          },
        },
        {
          policyDeps: {
            env: {
              OBSERVABILITY_CONTENT_MODE: "redacted",
              OBSERVABILITY_WORKSPACE_ALLOWLIST: scope.workspaceId,
            } as NodeJS.ProcessEnv,
            // Access side is the live probe; the deletion side is proven
            // with a fake remote in content-cleanup.pg.test.ts.
            verifyAccess: (workspaceId) =>
              probeContentAccessPath(workspaceId, db),
            verifyDeletion: async () => true,
          },
        },
      );
      expect(result.allowed).toBe(true);
      expect(result.availability).toBe("redacted");
      expect(result.auditId).not.toBeNull();
      expect(result.metadata.inputTokens).toBe(12);
      expect(result.metadata.outputTokens).toBe(34);
      expect(JSON.stringify(result.content?.payload)).not.toContain("hunter2");

      const rows = await db
        .select()
        .from(diagnosticAccessAudit)
        .where(eq(diagnosticAccessAudit.id, result.auditId as string));
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0])).not.toContain(CANARY);
      expect(JSON.stringify(rows[0])).not.toContain("hunter2");
    });

    it("denies the read when Postgres is unreachable; metadata stays readable", async () => {
      const restore = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const pool = new Pool({
        connectionString:
          "postgres://probe@127.0.0.1:1/adscale_test_probe_391",
        connectionTimeoutMillis: 1500,
      });
      try {
        const broken = drizzle(pool, { schema });
        const scope = ids("deny");
        const result = await readDiagnosticContent(
          {
            operatorId: scope.operatorId,
            scope: "platform-owner",
            workspaceId: scope.workspaceId,
            workItemId: scope.workItemId,
            callId: scope.callId,
            reason: "incident investigation",
            occurredAt: new Date().toISOString(),
            content: { text: "secret prompt" },
            metadata: {
              callId: scope.callId,
              provider: "openai",
              requestedModel: "gpt-5.6-sol",
              returnedModel: null,
              providerRequestId: null,
            },
          },
          {
            database: broken,
            policyDeps: {
              env: {
                OBSERVABILITY_CONTENT_MODE: "redacted",
                OBSERVABILITY_WORKSPACE_ALLOWLIST: scope.workspaceId,
              } as NodeJS.ProcessEnv,
              verifyAccess: async () => true,
              verifyDeletion: async () => true,
            },
          },
        );
        expect(result.allowed).toBe(false);
        expect(result.auditId).toBeNull();
        expect(result.content).toBeNull();
        expect(result.metadata.provider).toBe("openai");
        expect(result.metadata.requestedModel).toBe("gpt-5.6-sol");
      } finally {
        restore();
        await pool.end();
      }
    });

    it("proves the audit path with a live probe round-trip", async () => {
      const scope = ids("probe");
      await expect(
        probeContentAccessPath(scope.workspaceId, db),
      ).resolves.toBe(true);
      const rows = await db
        .select()
        .from(diagnosticAccessAudit)
        .where(eq(diagnosticAccessAudit.workspaceId, scope.workspaceId));
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].action).toBe("policy.verify");
    });
  },
);
