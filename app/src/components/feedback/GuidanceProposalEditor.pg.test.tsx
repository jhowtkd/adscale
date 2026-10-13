import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { db } from "@/server/db";
import { calibrationRules, clientProfiles, clientLearningProposals, user, workspaces, workspaceMembers, campaigns, derivations } from "@/server/db/schema";
import { POST, PATCH } from "@/app/api/admin/quality/learning/proposals/[id]/accept/route";
import { GET } from "@/app/api/admin/quality/learning/proposals/route";
import { apiFetch } from "@/lib/api-client";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { grantCorpusConsent } from "@/server/repositories/assistant-goal";
import { insertCorpusItem, submitCorpusEvaluation } from "@/server/repositories/human-quality-corpus";
import { GuidanceProposalEditor } from "./GuidanceProposalEditor";
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/server/auth/require-platform-owner", () => ({ requirePlatformOwner: vi.fn() }));
const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI === "true" ? process.env.DATABASE_URL : undefined);
if (testUrl) { const url = new URL(testUrl); if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) throw new Error("Requires matching local _test database URLs"); }
describe.skipIf(!testUrl)("proposal PG → HTTP → editor → approval", () => {
  it("uses the listed revision, saves exact text with author, refuses stale HTTP approval and approves only the displayed draft", async () => {
    const actorId = randomUUID(), email = `${actorId}@example.com`, workspaceId = randomUUID(), clientProfileId = randomUUID();
    try {
      vi.stubEnv("PLATFORM_OWNER_EMAILS", email);
      vi.mocked(requirePlatformOwner).mockResolvedValue({ user: { id: actorId, email } });
      await db.insert(user).values({ id: actorId, name: "Dono vertical", email });
      await db.insert(workspaces).values({ id: workspaceId, name: "Console test", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca" });
      await db.insert(workspaceMembers).values({ workspaceId, userId: actorId, role: "owner" });
      await grantCorpusConsent({ workspaceId, clientProfileId, reviewedByUserId: actorId });
      const [campaign] = await db.insert(campaigns).values({ workspaceId, clientProfileId, name: "Corpus simulado" }).returning();
      const corpusItemIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const [derivation] = await db.insert(derivations).values({ workspaceId, campaignId: campaign.id, status: "completed" }).returning();
        const item = await insertCorpusItem({ workspaceId, clientProfileId, campaignId: campaign.id, derivationId: derivation.id, generationMode: "art_variation", format: "1:1", cohort: "baseline", corpusVersion: 1, selectedByUserId: actorId, artifactRef: { derivationId: derivation.id }, qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" } });
        await submitCorpusEvaluation({ workspaceId, corpusItemId: item.id, reviewerUserId: actorId, visualScore: 62, factualPass: true, intent: "reject", primaryFailureReason: "visual_overload" });
        corpusItemIds.push(item.id);
      }
      const [row] = await db.insert(clientLearningProposals).values({ workspaceId, clientProfileId, sliceKey: `${workspaceId}:${clientProfileId}:visual_overload|art_variation|1:1`, primaryFailureReason: "visual_overload", rationale: "Texto original", evidenceRefs: { corpusItemIds, stats: { count: 3, meanSignedDelta: 20, meanAbsError: 20, overScoreCount: 3, underScoreCount: 0 } } }).returning();
      const list = await GET(new Request(`http://localhost/api/admin/quality/learning/proposals?clientProfileId=${clientProfileId}`));
      const original = (await list.json()).proposals[0];
      vi.mocked(apiFetch).mockImplementation(async (url, init) => (init?.method === "PATCH" ? PATCH : POST)(new Request(`http://localhost${url}`, init), { params: Promise.resolve({ id: row.id }) }));
      render(<GuidanceProposalEditor proposal={original} kind="corpus_quality" onChanged={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Editar e conferir orientação" }));
      const exact = "  Uma mensagem principal 😀  ";
      fireEvent.change(screen.getByLabelText("Texto editado"), { target: { value: exact } });
      fireEvent.click(screen.getByRole("checkbox", { name: "Redação" }));
      // Native mode label in the existing entry catalog.
      fireEvent.click(screen.getByRole("checkbox", { name: "Peça única" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "1:1" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Conferi o texto/ }));
      fireEvent.click(screen.getByRole("button", { name: "Salvar revisão" }));
      await screen.findByText("Revisão salva. Confira o texto antes de aprovar.");
      expect(screen.getByText(/Editado por Dono vertical/)).toBeInTheDocument();
      const stale = await POST(new Request("http://localhost/accept", { method: "POST", body: JSON.stringify({ expectedRevision: original.expectedRevision }) }), { params: Promise.resolve({ id: row.id }) });
      expect(stale.status).toBe(409); expect((await stale.json()).current.proposalDraft.editedText).toBe(exact);
      expect(await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, clientProfileId))).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Aprovar orientação" }));
      await screen.findByText("Orientação aprovada.");
      expect(screen.getByText("Texto original", { selector: "p" })).toBeInTheDocument(); expect(screen.getByText(exact.trim())).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Aprovar orientação" })).not.toBeInTheDocument();
      const [approved] = await db.select().from(calibrationRules).where(eq(calibrationRules.clientProfileId, clientProfileId));
      expect(approved).toMatchObject({ rationale: exact, primaryFailureReason: "visual_overload", approvedBy: actorId, proposalDraft: { originalText: "Texto original", editedText: exact, editedBy: actorId } });
    } finally { cleanup(); vi.unstubAllEnvs(); await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await db.delete(user).where(eq(user.id, actorId)); }
  });
});
