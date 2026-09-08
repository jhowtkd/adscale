import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool } from "pg";

vi.mock("@/server/db", () => ({
  db: { execute: vi.fn() },
}));

import {
  parseProductionSearchParams,
  productionCreatedAt,
  productionPageSql,
  type ProductionQuery,
  type ProductionRow,
} from "./creative-production";

describe("creative production catalog", () => {
  it("normaliza timestamp cru de string sem alterar sortAt de 6 dígitos", () => {
    expect(productionCreatedAt("2026-09-08 12:00:00.123456+00").toISOString())
      .toBe("2026-09-08T12:00:00.123Z");
    expect(productionCreatedAt(new Date("2026-09-08T12:00:00.123456Z")).toISOString())
      .toBe("2026-09-08T12:00:00.123Z");
  });

  it("recusa filtros e cursor inválidos", () => {
    expect(parseProductionSearchParams(new URLSearchParams("clientProfileId=abc"))).toBeNull();
    const id = "00000000-0000-4000-8000-000000000001";
    for (const suffix of ["limit=0", "limit=49", "cursor=invalido", "campaignId=abc"]) {
      expect(parseProductionSearchParams(new URLSearchParams(`clientProfileId=${id}&${suffix}`))).toBeNull();
    }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("isola campanhas e pagina sem misturar origens", async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
    expect(url.port).toBe("5433");
    expect(url.pathname).toBe("/adscale_test");
    const fixture = JSON.parse(readFileSync("tests/fixtures/create-post-e2e.json", "utf8")) as {
      workspaceId: string;
      primaryClientProfileId: string;
      userId: string;
      insufficientBalance: { workspaceId: string; clientProfileId: string };
    };
    const pool = new Pool({ connectionString: url.toString(), max: 1 });
    const client = await pool.connect();
    const campaignA = randomUUID();
    const campaignB = randomUUID();
    const work = randomUUID();
    const deck = randomUUID();
    const output = randomUUID();
    const slide = randomUUID();
    const oldSlide = randomUUID();
    const derivation = randomUUID();
    const foreignDerivation = randomUUID();
    try {
      await client.query("begin");
      await client.query(
        `insert into adscale_app.campaigns (id,workspace_id,client_profile_id,name)
          values ($1,$3,$4,'Mesa A'),($2,$3,$4,'Mesa B')`,
        [campaignA, campaignB, fixture.workspaceId, fixture.primaryClientProfileId],
      );
      await client.query(
        `insert into adscale_app.creative_work_items
          (id,workspace_id,client_profile_id,created_by_user_id,title,request,campaign_id,tool_kind,settings)
          values ($1,$3,$4,$5,'Peça','Pedido',$6,'single','{}'),
                 ($2,$3,$4,$5,'Deck','Pedido',$6,'carousel','{}')`,
        [work, deck, fixture.workspaceId, fixture.primaryClientProfileId, fixture.userId, campaignA],
      );
      await client.query(
        `insert into adscale_app.creative_work_outputs
          (id,workspace_id,work_item_id,creative_level,target_format,operation_key,status,output_key)
          values ($1,$2,$3,'balanced','4:5',$4,'completed','test/output.png')`,
        [output, fixture.workspaceId, work, output],
      );
      for (const [id, current] of [[slide, true], [oldSlide, false]] as const) {
        await client.query(
          `insert into adscale_app.creative_work_carousel_slides
            (id,workspace_id,work_item_id,lineage_id,version_number,deck_revision,position,role,
             primary_text,copy_authority,layout_family,status,output_key,visual_contract_hash,
             generation_operation_key,is_current)
            values ($1,$2,$3,$1,1,'deck-r1',1,'hook','Capa','user_input','impact','completed',
              'test/slide.png','hash',$4,$5)`,
          [id, fixture.workspaceId, deck, id, current],
        );
      }
      await client.query(
        `insert into adscale_app.derivations
          (id,workspace_id,campaign_id,status,output_key,is_preview)
          values ($1,$3,$4,'completed','test/derivation.png',false),
                 ($2,$3,$5,'completed','test/foreign.png',false)`,
        [derivation, foreignDerivation, fixture.workspaceId, campaignA, campaignB],
      );
      await client.query(
        `insert into adscale_app.derivations
          (id,workspace_id,campaign_id,status,output_key,is_preview)
          values ($1,$2,$3,'completed','test/preview.png',true)`,
        [randomUUID(), fixture.workspaceId, campaignA],
      );
      const failedOutput = randomUUID();
      await client.query(
        `insert into adscale_app.creative_work_outputs
          (id,workspace_id,work_item_id,creative_level,target_format,operation_key,status,output_key,version_number)
          values ($1,$2,$3,'balanced','4:5',$4,'failed','test/failed.png',2)`,
        [failedOutput, fixture.workspaceId, work, failedOutput],
      );
      const input: ProductionQuery = {
        workspaceId: fixture.workspaceId,
        clientProfileId: fixture.primaryClientProfileId,
        campaignId: campaignA,
        limit: 2,
        cursor: null,
      };
      const run = async (query: ProductionQuery) => {
        const compiled = new PgDialect().sqlToQuery(productionPageSql(query));
        return (await client.query(compiled.sql, compiled.params)).rows as ProductionRow[];
      };
      const first = await run(input);
      expect(first).toHaveLength(3);
      expect(first[0]!.sortAt).toMatch(/\.\d{6}Z$/);
      expect(first[0]!.createdAt instanceof Date ? true : typeof first[0]!.createdAt === "string").toBe(true);
      const cursor = { at: first[1]!.sortAt, id: first[1]!.id };
      const second = await run({ ...input, cursor });
      expect(second).toHaveLength(1);
      expect(new Set([...first.slice(0, 2), ...second].map((row) => row.id))).toEqual(new Set([
        `output:${output}`,
        `slide:${slide}`,
        `derivation:${derivation}`,
      ]));
      expect(await run({ ...input, workspaceId: fixture.insufficientBalance.workspaceId })).toEqual([]);
      expect(await run({ ...input, clientProfileId: fixture.insufficientBalance.clientProfileId })).toEqual([]);
    } finally {
      await client.query("rollback");
      client.release();
      await pool.end();
    }
  });
});
