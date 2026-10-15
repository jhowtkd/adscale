import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { db } from "@/server/db";
import { calibrationRules, clientProfiles, user, workspaces } from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { listCalibrationRuleHistory } from "@/server/repositories/calibration-rule-history";
import { GET, PATCH } from "@/app/api/admin/quality/brands/[clientProfileId]/rules/route";
import { apiFetch } from "@/lib/api-client";
import { getGuidanceSelection } from "@/server/repositories/guidance-selection";
import { loadLocalLearningPromptCalibrationContext } from "@/server/brand-taste/prompt-calibration-loader";
import { pinGuidanceSelection } from "@/server/brand-taste/guidance-selection";
import { BrandCalibrationRulesPanel } from "./BrandCalibrationRulesPanel";

vi.mock("@/server/auth/require-platform-owner", () => ({ requirePlatformOwner: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Brand rules panel requires matching local test database URLs ending in _test");
  }
}

describe.skipIf(!testUrl)("Brand rules PG → HTTP → panel", () => {
  it("reverts from the panel through HTTP to the eligible previous revision with persisted authorship", async () => {
    const reviewer = randomUUID(), workspaceId = randomUUID(), clientProfileId = randomUUID(), email = `${reviewer}@example.test`;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const own = { workspaceId, clientProfileId }, rationale = "Voz anterior para restaurar";
    try {
      vi.stubEnv("PLATFORM_OWNER_EMAILS", email);
      vi.mocked(requirePlatformOwner).mockResolvedValue({ user: { id: reviewer, email } });
      await db.insert(user).values({ id: reviewer, name: "Dono simulado", email });
      await db.insert(workspaces).values({ id: workspaceId, name: "Reversão simulada", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      const [rule] = await db.insert(calibrationRules).values({ ...own, category: "voice", status: "approved", rationale,
        confirmedMetadata: { category: "voice", nature: "text", roles: ["copy"], generationModes: ["single"], formats: ["1:1"], contentHash: hashGuidanceContent(rationale) },
        metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date() }).returning();
      const previous = await getGuidanceSelection(own);
      const pinned = await pinGuidanceSelection({ ...own, reviewerUserId: reviewer, expectedVersion: previous.version, refs: [] });
      await db.update(calibrationRules).set({ rationale: "Voz nova", confirmedMetadata: { ...rule.confirmedMetadata!, contentHash: hashGuidanceContent("Voz nova") } }).where(eq(calibrationRules.id, rule.id));
      const history = await listCalibrationRuleHistory(own);
      vi.mocked(apiFetch).mockImplementation(async (url, options) => {
        if (!String(url).includes("/rules")) return new Response(null, { status: 404 });
        const request = new Request(`http://localhost${url}`, options), context = { params: Promise.resolve({ clientProfileId }) };
        return options?.method === "PATCH" ? PATCH(request, context) : GET(request, context);
      });
      render(<QueryClientProvider client={queryClient}><BrandCalibrationRulesPanel clientProfileId={clientProfileId} /></QueryClientProvider>);
      fireEvent.click(await screen.findByRole("button", { name: "Reverter para seleção anterior" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirmar reversão" }));
      await waitFor(async () => expect(await getGuidanceSelection(own)).toMatchObject({ version: pinned.version + 1, refs: previous.refs, pinnedBy: reviewer }));
      expect(await screen.findByText(new RegExp(`Revisão 1: ${rationale} · Hash:`))).toBeInTheDocument();
      expect((await getGuidanceSelection(own)).previousSelection?.refs).toEqual([]);
      expect(await listCalibrationRuleHistory(own)).toEqual(history);
      const loaded = await loadLocalLearningPromptCalibrationContext({ ...own, role: "copy", generationMode: "single", format: "1:1", language: "pt-BR", fixedPromptVersion: "copy/v1" });
      expect(loaded.appliedRefs).toEqual(previous.refs); expect(loaded.lines).toContain(rationale);
    } finally {
      cleanup(); queryClient.clear(); vi.unstubAllEnvs();
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await db.delete(user).where(eq(user.id, reviewer));
    }
  });
  it("pins from the panel through HTTP, retains exact refs after a new approval and shows retirement", async () => {
    const reviewer = randomUUID(), workspaceId = randomUUID(), clientProfileId = randomUUID(), email = `${reviewer}@example.test`;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const own = { workspaceId, clientProfileId };
    const rationale = "Voz aprovada para fixar";
    try {
      vi.stubEnv("PLATFORM_OWNER_EMAILS", email);
      vi.mocked(requirePlatformOwner).mockResolvedValue({ user: { id: reviewer, email } });
      await db.insert(user).values({ id: reviewer, name: "Dono simulado", email });
      await db.insert(workspaces).values({ id: workspaceId, name: "Fixação simulada", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      const [rule] = await db.insert(calibrationRules).values({ ...own, category: "voice", status: "approved", rationale,
        confirmedMetadata: { category: "voice", nature: "text", roles: ["copy"], generationModes: ["single"], formats: ["1:1"], contentHash: hashGuidanceContent(rationale) },
        metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date() }).returning();
      vi.mocked(apiFetch).mockImplementation(async (url, options) => {
        if (!String(url).includes("/rules")) return new Response(null, { status: 404 });
        const request = new Request(`http://localhost${url}`, options), context = { params: Promise.resolve({ clientProfileId }) };
        return options?.method === "PATCH" ? PATCH(request, context) : GET(request, context);
      });
      render(<QueryClientProvider client={queryClient}><BrandCalibrationRulesPanel clientProfileId={clientProfileId} /></QueryClientProvider>);
      fireEvent.click(await screen.findByRole("button", { name: "Escolher revisões para fixar" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirmar fixação" }));
      await screen.findByText(new RegExp(`Fixada por ${reviewer}`));
      const pinned = await getGuidanceSelection(own);
      expect(pinned).toMatchObject({ pinnedBy: reviewer, refs: [{ ruleId: rule.id, revision: 1, contentHash: hashGuidanceContent(rationale) }], previousSelection: { pinnedBy: null } });
      await db.update(calibrationRules).set({ rationale: "Texto posterior", confirmedMetadata: { ...rule.confirmedMetadata!, contentHash: hashGuidanceContent("Texto posterior") } }).where(eq(calibrationRules.id, rule.id));
      const loaded = await loadLocalLearningPromptCalibrationContext({ ...own, role: "copy", generationMode: "single", format: "1:1", language: "pt-BR", fixedPromptVersion: "copy/v1" });
      expect(loaded.appliedRefs).toEqual(pinned.refs); expect(loaded.lines).toContain(rationale);
      await queryClient.invalidateQueries({ queryKey: ["brand-calibration-rules", clientProfileId] });
      const updatedRow = within((await screen.findByTitle("Texto posterior")).closest("tr")!);
      fireEvent.click(updatedRow.getByRole("button", { name: "Depreciar orientação" }));
      fireEvent.change(await screen.findByLabelText("Motivo da decisão"), { target: { value: "Não aplicar mais" } });
      fireEvent.click(screen.getByRole("button", { name: "Confirmar depreciação" }));
      await screen.findByText(/Omitida: orientação depreciada ou rejeitada/);
      expect(await getGuidanceSelection(own)).toEqual(pinned);
      expect((await loadLocalLearningPromptCalibrationContext({ ...own, role: "copy", generationMode: "single", format: "1:1", language: "en", fixedPromptVersion: "copy/v1" })).appliedRefs).toEqual([]);
    } finally {
      cleanup(); queryClient.clear(); vi.unstubAllEnvs();
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await db.delete(user).where(eq(user.id, reviewer));
    }
  });

  it.each(["deprecate", "reject"])("persists %s from the panel through HTTP with immutable approval", async action => {
    const reviewer = randomUUID(), workspaceId = randomUUID(), clientProfileId = randomUUID();
    const email = `${reviewer}@example.test`;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const own = { workspaceId, clientProfileId };
    try {
      vi.stubEnv("PLATFORM_OWNER_EMAILS", email);
      vi.mocked(requirePlatformOwner).mockResolvedValue({ user: { id: reviewer, email } });
      await db.insert(user).values({ id: reviewer, name: "Dono simulado", email });
      await db.insert(workspaces).values({ id: workspaceId, name: "Decisão simulada", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      const [rule] = await db.insert(calibrationRules).values({ ...own, category: "voice", status: "approved", rationale: "Texto aprovado preservado",
        approvedBy: reviewer, approvedAt: new Date("2026-10-01T00:00:00Z") }).returning();
      const before = await listCalibrationRuleHistory(own);
      vi.mocked(apiFetch).mockImplementation(async (url, options) => {
        if (!String(url).includes("/rules")) return new Response(null, { status: 404 });
        const request = new Request(`http://localhost${url}`, options);
        const context = { params: Promise.resolve({ clientProfileId }) };
        return options?.method === "PATCH" ? PATCH(request, context) : GET(request, context);
      });
      render(<QueryClientProvider client={queryClient}><BrandCalibrationRulesPanel clientProfileId={clientProfileId} /></QueryClientProvider>);
      fireEvent.click(await screen.findByRole("button", { name: action === "reject" ? "Rejeitar orientação" : "Depreciar orientação" }));
      fireEvent.change(screen.getByLabelText("Motivo da decisão"), { target: { value: "  Mudança confirmada  " } });
      fireEvent.click(screen.getByRole("button", { name: action === "reject" ? "Confirmar rejeição" : "Confirmar depreciação" }));
      // Opening the reason form already hides the action buttons; wait for the persisted decision instead.
      await screen.findByText("Motivo: Mudança confirmada", {}, { timeout: 5000 });
      const history = await listCalibrationRuleHistory(own);
      expect(history).toHaveLength(2); expect(history[0]).toEqual(before[0]);
      expect(history[1]).toMatchObject({ decisionBy: reviewer, decisionReason: "Mudança confirmada", approvedBy: reviewer });
      const destination = within(screen.getByText(action === "reject" ? "Orientações rejeitadas" : "Orientações depreciadas").closest("section")!);
      expect(destination.getByText("Motivo: Mudança confirmada")).toBeInTheDocument();
      expect(destination.getAllByText(`Autoria da decisão: ${reviewer}`)).toHaveLength(2);
      expect(destination.getAllByText(/Aprovação registrada:/)).toHaveLength(2);
      expect((await db.select().from(calibrationRules).where(eq(calibrationRules.id, rule.id)))[0]).toMatchObject({ approvedBy: rule.approvedBy, approvedAt: rule.approvedAt });
    } finally {
      cleanup(); queryClient.clear(); vi.unstubAllEnvs();
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, reviewer));
    }
  });

  it("preserves confirmed destinations and scope alongside explicit legacy absence without writes", async () => {
    const reviewer = randomUUID(), workspaceId = randomUUID(), clientProfileId = randomUUID();
    const rationale = "Orientação confirmada para o console";
    const confirmedMetadata = { category: "voice" as const, nature: "text" as const,
      roles: ["copy" as const], generationModes: ["single", "carousel"], formats: ["4:5", "1:1"],
      contentHash: hashGuidanceContent(rationale) };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await db.insert(user).values({ id: reviewer, name: "Revisor simulado", email: `${reviewer}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Console simulado", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      await db.insert(calibrationRules).values([
        { workspaceId, clientProfileId, category: "voice", status: "approved", rationale,
          confirmedMetadata, metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date() },
        { workspaceId, clientProfileId, category: "gestalt", status: "candidate", rationale: "Orientação legada" },
      ]);
      const stored = () => db.select().from(calibrationRules).where(eq(calibrationRules.workspaceId, workspaceId)).orderBy(calibrationRules.id);
      const before = await stored();
      vi.mocked(apiFetch).mockImplementation(async url => {
        if (!String(url).includes("/rules")) return new Response(null, { status: 404 });
        return GET(new Request(`http://localhost${url}`), { params: Promise.resolve({ clientProfileId }) });
      });
      const response = await GET(new Request(`http://localhost/api/admin/quality/brands/${clientProfileId}/rules`), {
        params: Promise.resolve({ clientProfileId }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.approved[0].confirmedMetadata).toEqual(confirmedMetadata);
      expect(body.candidate[0].confirmedMetadata).toBeNull();
      expect(body.history).toHaveLength(2);
      expect(body.history.find((row: { text: string }) => row.text === rationale)).toMatchObject({
        contentHash: hashGuidanceContent(rationale), approvedBy: null, metadataConfirmedBy: reviewer,
        confirmedMetadata, revisionNumber: 1,
      });
      render(<QueryClientProvider client={queryClient}><BrandCalibrationRulesPanel clientProfileId={clientProfileId} /></QueryClientProvider>);
      const confirmed = within((await screen.findByTitle(rationale)).closest("tr")!);
      expect(confirmed.getByText("Papéis de destino: Redação")).toBeInTheDocument();
      expect(confirmed.getByText("Escopo: marca selecionada; modos: Peça única, Carrossel; formatos: 4:5, 1:1")).toBeInTheDocument();
      expect(confirmed.queryByText(/não registrad/)).not.toBeInTheDocument();
      const legacy = within(screen.getByTitle("Orientação legada").closest("tr")!);
      expect(legacy.getByText("Papéis de destino: não registrados")).toBeInTheDocument();
      expect(legacy.getByText("Escopo: marca selecionada; contexto específico não registrado")).toBeInTheDocument();
      expect(legacy.getByRole("button", { name: "Editar e conferir orientação" })).toBeInTheDocument();
      expect(legacy.getByText("Histórico da orientação (1 revisão)")).toBeInTheDocument();
      expect(confirmed.getByText("Histórico da orientação (1 revisão)")).toBeInTheDocument();
      expect(confirmed.getByText("Autoria da decisão: desconhecida")).toBeInTheDocument();
      expect(await stored()).toEqual(before);
    } finally {
      cleanup();
      queryClient.clear();
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, reviewer));
    }
  });
});
