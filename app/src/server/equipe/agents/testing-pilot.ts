// Test fixture: a free account in the shape of the PILOT's (ticket 15): a confirmed brand whose reading left a huge
// handoff row (tens of thousands of characters of site text, dozens of image URLs, Instagram captions) and a recorded
// diagnosis. Nothing here calls a model or the network.

import { makeTestDeps, uuid, type TestDeps } from "../module/testing/deps";
import { confirmedHandoff } from "../module/testing/diagnosis";
import type { HandoffCaptured, HandoffDecisions, HandoffItem } from "../domain/handoff";
import type { DiagnosisContent } from "../handoff/diagnosis-contract";
import { DIAGNOSTIC_RECORDED_EVENT } from "./free-budget";

/** Markers that live ONLY in the raw handoff row: none of them may reach the model. */
export const RAW = { site: "SITE-BRUTO-", imageUrl: "https://cdn.example/instagram-assinada/", caption: "LEGENDA-IG-", siteImage: "https://cdn.example/site-img/" };

const filler = (marker: string, length: number) => `${marker} ${"lorem ipsum dolor sit amet ".repeat(40)}`.slice(0, length);

export function bigSiteText() {
  const blocks: string[] = [];
  for (let i = 0; blocks.join("\n\n").length < 50_000; i++) {
    blocks.push(`## ${RAW.site}${i}\n\n[Veja mais](https://cafeaurora.example/pagina-${i}?utm=${"x".repeat(60)}) ![foto](${RAW.siteImage}${i}.jpg)\n\n${"Texto corrido do site que ninguém precisa reler no chat. ".repeat(12)}`);
  }
  return blocks.join("\n\n");
}

export function bigCaptured(): HandoffCaptured {
  const long = (i: number) => `${RAW.imageUrl}${i}/${"s".repeat(280)}?sig=${"k".repeat(120)}`;
  return {
    publicContent: [
      { id: uuid(), value: bigSiteText(), origin: "site" },
      { id: uuid(), value: "Café especial de torra própria ☕ Campinas - SP", origin: "instagram" },
    ],
    images: [
      ...Array.from({ length: 30 }, (_, i): HandoffItem => ({ id: uuid(), value: `${RAW.siteImage}${i}/${"u".repeat(200)}.jpg`, origin: "site", key: `k/${uuid()}`, width: 800, height: 600 })),
      ...Array.from({ length: 12 }, (_, i): HandoffItem => ({ id: uuid(), value: long(i), origin: "instagram", caption: filler(`${RAW.caption}${i}`, 600), key: `k/${uuid()}` })),
    ],
  };
}

export function pilotDecisions(captured: HandoffCaptured): HandoffDecisions {
  const images = captured.images ?? [];
  return {
    identity: {
      name: { id: uuid(), value: "Café Aurora", origin: "site" },
      logo: { id: uuid(), value: `https://cdn.example/logo/${"l".repeat(150)}.png`, origin: "site", key: `k/${uuid()}` },
      colors: ["#6F4E37", "#F5E6D3", "#222222"].map(value => ({ id: uuid(), value, origin: "site" as const })),
      fonts: ["Inter", "Playfair Display"].map(value => ({ id: uuid(), value, origin: "site" as const })),
      paletteChoice: "site",
    },
    networks: [{ id: uuid(), value: "cafeaurora", origin: "site", platform: "instagram" }, { id: uuid(), value: "https://facebook.com/cafeaurora", origin: "site", platform: "facebook" }],
    images: { kept: images.slice(0, 20).map(item => item.id), removed: images.slice(20, 22).map(item => item.id), uploaded: [] },
  };
}

export const DIAGNOSIS: DiagnosisContent = {
  status: "complete",
  brand: "Café Aurora",
  summary: "Torrefação de café especial em Campinas que vende em grãos, moído e por assinatura mensal, com ficha de origem em cada lote.",
  channels: [
    { name: "Site", source: "site", message: "Mostra a origem de cada lote e a assinatura mensal." },
    { name: "Instagram", source: "instagram", message: "Receitas e bastidores da torra, com boa constância." },
  ],
  opportunities: [
    { title: "Mostrar a origem de cada lote nos posts", sources: ["site", "instagram"] },
    { title: "Levar a assinatura mensal para o Instagram", sources: ["site"] },
    { title: "Transformar as receitas em série semanal", sources: ["instagram"] },
  ],
  notFound: ["Preço da assinatura", "Depoimentos de clientes"],
  sources: [
    { origin: "site", quote: "Torramos café especial de origem única, em pequenos lotes", supports: "summary" },
    { origin: "site", quote: "A assinatura entrega dois pacotes de 250 g na sua porta", supports: "channel:site" },
    { origin: "instagram", quote: "Receita de cold brew com o lote Fazenda Boa Vista", supports: "channel:instagram" },
    { origin: "site", quote: "Cada lote tem ficha com fazenda, altitude e nota de torra", supports: "opportunity:1" },
    { origin: "site", quote: "Vendemos café em grãos, moído e por assinatura mensal", supports: "opportunity:2" },
    { origin: "instagram", quote: "Bastidores da torra de hoje: 12 minutos, perfil médio", supports: "opportunity:3" },
  ],
  meta: { readingId: "", taskIntentId: null, model: null, promptVersion: null, inputSources: ["site", "instagram"] },
};

export type PilotOptions = {
  t?: TestDeps;
  /** `none`: nothing recorded. */
  diagnosis?: "recorded" | "none";
  content?: Partial<DiagnosisContent>;
  /** Also records a diagnosis of ANOTHER reading (older version) with this summary. */
  otherReadingSummary?: string;
  /** Raw handoff row as big as the pilot's (default true). */
  big?: boolean;
};

export async function pilotAccount(options: PilotOptions = {}) {
  const t = options.t ?? makeTestDeps();
  const f = await confirmedHandoff(t);
  const big = options.big ?? true;
  const captured = big ? bigCaptured() : undefined;
  if (captured) await t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { captured, decisions: pilotDecisions(captured) });
  const account = await t.deps.uow.repos.accounts.get(f.workspaceId, f.accountId);
  const clientProfileId = account!.clientProfileId as string;
  let version = 0;
  const record = async (readingId: string, content: Partial<DiagnosisContent>) => {
    version += 1;
    const doc = await t.deps.uow.repos.documents.create(f.scope, {
      clientProfileId, kind: "diagnosis", version, createdByRole: "research",
      content: { ...DIAGNOSIS, ...content, meta: { ...DIAGNOSIS.meta, readingId } } as never,
    });
    await t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "diag", actorRole: "system",
      eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: doc.id }, occurredAt: t.deps.clock.now() });
    return doc;
  };
  if (options.otherReadingSummary) await record(uuid(), { summary: options.otherReadingSummary });
  if (options.diagnosis !== "none") await record(f.readingId, options.content ?? {});
  return { ...f, ctx: { deps: t.deps, workspaceId: f.workspaceId, accountId: f.accountId }, record };
}
