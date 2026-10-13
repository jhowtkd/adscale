import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { db } from "@/server/db";
import { calibrationRules, clientProfiles, user, workspaces } from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { GET } from "@/app/api/admin/quality/brands/[clientProfileId]/rules/route";
import { apiFetch } from "@/lib/api-client";
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
      render(<QueryClientProvider client={queryClient}><BrandCalibrationRulesPanel clientProfileId={clientProfileId} /></QueryClientProvider>);
      const confirmed = within((await screen.findByText(rationale)).closest("tr")!);
      expect(confirmed.getByText("Papéis de destino: Redação")).toBeInTheDocument();
      expect(confirmed.getByText("Escopo: marca selecionada; modos: Peça única, Carrossel; formatos: 4:5, 1:1")).toBeInTheDocument();
      expect(confirmed.queryByText(/não registrad/)).not.toBeInTheDocument();
      const legacy = within(screen.getByText("Orientação legada").closest("tr")!);
      expect(legacy.getByText("Papéis de destino: não registrados")).toBeInTheDocument();
      expect(legacy.getByText("Escopo: marca selecionada; contexto específico não registrado")).toBeInTheDocument();
      expect(await stored()).toEqual(before);
    } finally {
      cleanup();
      queryClient.clear();
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, reviewer));
    }
  });
});
