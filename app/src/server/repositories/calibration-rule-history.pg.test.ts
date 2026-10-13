import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../db";
import { workspaces, clientProfiles, calibrationRules, calibrationRuleRevisions, user } from "../db/schema";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";
import { listCalibrationRuleHistory, resolveCalibrationRuleHistoryReference } from "./calibration-rule-history";
const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) { const u = new URL(testUrl); if (!["localhost","127.0.0.1"].includes(u.hostname) || !u.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) throw new Error("Requires matching local test database URLs"); }
describe.skipIf(!testUrl)("immutable guidance history (Postgres)", () => {
 it("keeps exact earlier approved text when the same rule changes and is deprecated", async () => {
  const workspaceId=randomUUID(), clientProfileId=randomUUID();
  try {
   await db.insert(workspaces).values({id:workspaceId,slug:workspaceId,name:"History test"});
   await db.insert(clientProfiles).values({id:clientProfileId,workspaceId,name:"Brand"});
   const text="  Voz humana 😀  ";
   const updatedText="  Segundo texto café 🧪  ";
   const originalHash=createHash("sha256").update(text,"utf8").digest("hex");
   const updatedHash=createHash("sha256").update(updatedText,"utf8").digest("hex");
   const [rule]=await db.insert(calibrationRules).values({workspaceId,clientProfileId,category:"voice",status:"approved",rationale:text}).returning();
   const reference={ruleId:rule.id,revision:"legacy" as const,contentHash:originalHash};
   const frozen=JSON.stringify(reference);
   expect.soft((await listCalibrationRuleHistory({workspaceId,clientProfileId}))[0].contentHash).toBe(originalHash);
   await db.update(calibrationRules).set({rationale:updatedText}).where(eq(calibrationRules.id,rule.id));
   expect.soft((await listCalibrationRuleHistory({workspaceId,clientProfileId}))[1].contentHash).toBe(updatedHash);
   await db.update(calibrationRules).set({status:"deprecated"}).where(eq(calibrationRules.id,rule.id));
   const history=await listCalibrationRuleHistory({workspaceId,clientProfileId});
   expect.soft(history.map(r=>[r.revisionNumber,r.status,r.text,r.contentHash])).toEqual([[1,"approved",text,originalHash],[2,"approved",updatedText,updatedHash],[3,"deprecated",updatedText,updatedHash]]);
   expect(new Set(history.map(r=>r.ruleId))).toEqual(new Set([rule.id]));
   expect(await resolveCalibrationRuleHistoryReference({workspaceId,clientProfileId,reference})).toEqual({reference,text});
   expect(JSON.stringify(reference)).toBe(frozen);
   expect(await resolveCalibrationRuleHistoryReference({workspaceId:randomUUID(),clientProfileId,reference})).toBeNull();
   expect(await resolveCalibrationRuleHistoryReference({workspaceId,clientProfileId,reference:{...reference,contentHash:"missing"}})).toBeNull();
  } finally {await db.delete(workspaces).where(eq(workspaces.id,workspaceId));}
 });
 it("enforces unique rule/number and refuses update, direct delete and truncate", async () => {
  const workspaceId=randomUUID(), clientProfileId=randomUUID();
  try {
   await db.insert(workspaces).values({id:workspaceId,slug:workspaceId,name:"Immutable test"});
   await db.insert(clientProfiles).values({id:clientProfileId,workspaceId,name:"Brand"});
   const [rule]=await db.insert(calibrationRules).values({workspaceId,clientProfileId,category:"voice",rationale:"Original"}).returning();
   const [revision]=await db.select().from(calibrationRuleRevisions).where(eq(calibrationRuleRevisions.ruleId,rule.id));
   await expect(db.insert(calibrationRuleRevisions).values({...revision,id:randomUUID()})).rejects.toMatchObject({cause:{code:"23505"}});
   await expect(db.update(calibrationRuleRevisions).set({snapshot:{rationale:"Tampered"}}).where(eq(calibrationRuleRevisions.id,revision.id))).rejects.toMatchObject({cause:{code:"55000"}});
   await expect(db.delete(calibrationRuleRevisions).where(eq(calibrationRuleRevisions.id,revision.id))).rejects.toMatchObject({cause:{code:"55000"}});
   await expect(db.execute(sql`TRUNCATE adscale_app.calibration_rule_revisions`)).rejects.toMatchObject({cause:{code:"55000"}});
   expect((await listCalibrationRuleHistory({workspaceId,clientProfileId}))[0].text).toBe("Original");
  } finally {await db.delete(workspaces).where(eq(workspaces.id,workspaceId));}
 });
 it("serializes concurrent decisions, ignores timestamp-only refresh and preserves known authors after user deletion",async()=>{
  const workspaceId=randomUUID(),clientProfileId=randomUUID(),actor=randomUUID();
  try{
   await db.insert(user).values({id:actor,name:"Known author",email:actor+"@example.test"});
   await db.insert(workspaces).values({id:workspaceId,slug:workspaceId,name:"Concurrent test"});
   await db.insert(clientProfiles).values({id:clientProfileId,workspaceId,name:"Brand"});
   const [rule]=await db.insert(calibrationRules).values({workspaceId,clientProfileId,category:"voice",status:"candidate",rationale:"Literal"}).returning();
   await Promise.all(["approved","rejected","deprecated"].map(status=>db.update(calibrationRules).set({status,approvedBy:actor,approvedAt:new Date("2026-10-01T00:00:00Z")}).where(eq(calibrationRules.id,rule.id))));
   const before=await listCalibrationRuleHistory({workspaceId,clientProfileId});
   expect(before.map(row=>row.revisionNumber)).toEqual([1,2,3,4]);
   expect(new Set(before.map(row=>row.status))).toEqual(new Set(["candidate","approved","rejected","deprecated"]));
   await db.update(calibrationRules).set({updatedAt:new Date()}).where(eq(calibrationRules.id,rule.id));
   expect(await listCalibrationRuleHistory({workspaceId,clientProfileId})).toEqual(before);
   await db.delete(user).where(eq(user.id,actor));
   const after=await listCalibrationRuleHistory({workspaceId,clientProfileId});
   expect(after.slice(0,4)).toEqual(before);
   expect(after[4].approvedBy).toBeNull();
   expect(after.slice(1,4).every(row=>row.approvedBy===actor)).toBe(true);
   expect(await listCalibrationRuleHistory({workspaceId:randomUUID(),clientProfileId})).toEqual([]);
   expect(await listCalibrationRuleHistory({workspaceId,clientProfileId:randomUUID()})).toEqual([]);
  } finally {await db.delete(workspaces).where(eq(workspaces.id,workspaceId));await db.delete(user).where(eq(user.id,actor));}
 });
});
