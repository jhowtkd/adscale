// Test fixture for the free diagnosis: a free account whose brand handoff is
// CONFIRMED (step done) with the collected public content the reading would have
// left, plus the `equipe.handoff.diagnose` intent the "É isso" writes. Nothing
// here calls a model or the network.

import { executeCommand } from "../commands";
import { HANDOFF_DIAGNOSE_EVENT } from "../../handoff/contract";
import type { HandoffCaptured, HandoffDecisions, HandoffItem } from "../../domain/handoff";
import { makeTestDeps, uuid, type TestDeps } from "./deps";

export const SITE_TEXT = [
  "# Café Aurora",
  "Torramos café especial de origem única, em pequenos lotes, na nossa torra própria em Campinas.",
  "Vendemos café em grãos, moído e por assinatura mensal. A assinatura entrega dois pacotes de 250 g na sua porta.",
  "Cada lote tem ficha com fazenda, altitude e nota de torra. Conheça a origem dos grãos que você bebe.",
].join("\n\n");

export const INSTAGRAM_BIO = "Café especial de torra própria ☕ Receitas, bastidores e cafés da semana. Campinas - SP";
export const INSTAGRAM_CAPTIONS = [
  "Receita de cold brew com o lote Fazenda Boa Vista: 1 parte de café para 8 de água, 14 horas na geladeira.",
  "Bastidores da torra de hoje: 12 minutos, perfil médio, notas de chocolate e laranja.",
  "Café da semana: Sítio das Flores, notas de frutas amarelas e mel. Moído na hora.",
];

export type ConfirmedHandoffOptions = {
  site?: string | null;
  instagram?: { bio: string; captions: string[] } | null;
  name?: HandoffItem | null;
  colors?: HandoffItem[];
  fonts?: HandoffItem[];
  readsUsed?: number;
  /** Adds origin=user data everywhere it could hide, to prove it never reaches the model. */
  hostileUserData?: boolean;
};

export async function confirmedHandoff(t: TestDeps = makeTestDeps(), options: ConfirmedHandoffOptions = {}) {
  const workspaceId = uuid();
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana Souza", email: "ana@example.com", emailVerified: true,
    role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId },
    { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(`open_free_account failed: ${opened.error.code}`);
  const accountId = opened.value.accountId!;
  const scope = { workspaceId, accountId };
  const [person] = await t.deps.uow.repos.people.list(scope);
  const approver = { kind: "client_person", role: "approver", personId: person!.id } as const;
  const [row] = await t.deps.uow.repos.handoffs.list(scope);

  const site = options.site === undefined ? SITE_TEXT : options.site;
  const instagram = options.instagram === undefined ? { bio: INSTAGRAM_BIO, captions: INSTAGRAM_CAPTIONS } : options.instagram;
  const name = options.name === undefined ? { id: uuid(), value: "Café Aurora", origin: "site" as const } : options.name;
  const hostile = options.hostileUserData ? "SEGREDO-DO-USUARIO" : "";
  const captured: HandoffCaptured = {
    publicContent: [
      ...(site ? [{ id: uuid(), value: site, origin: "site" as const }] : []),
      ...(instagram ? [{ id: uuid(), value: instagram.bio, origin: "instagram" as const }] : []),
      ...(hostile ? [{ id: uuid(), value: `${hostile} texto digitado pela pessoa`, origin: "user" as const }] : []),
    ],
    images: [
      ...(instagram ? instagram.captions.map(caption => ({ id: uuid(), value: "https://cdn.example/post.jpg", origin: "instagram" as const, caption, key: `k/${uuid()}` })) : []),
      ...(hostile ? [{ id: uuid(), value: "upload.png", origin: "user" as const, caption: `${hostile} legenda do upload`, key: `k/${uuid()}` }] : []),
    ],
  };
  const decisions: HandoffDecisions = {
    identity: {
      name: name ?? { id: uuid(), value: "Marca da Ana", origin: "user" },
      logo: null,
      colors: options.colors ?? [{ id: uuid(), value: "#6F4E37", origin: "site" }, ...(hostile ? [{ id: uuid(), value: "#010203", origin: "user" as const }] : [])],
      fonts: options.fonts ?? [{ id: uuid(), value: "Inter", origin: "site" }],
      paletteChoice: "site",
    },
    networks: instagram ? [{ id: uuid(), value: "cafeaurora", origin: "site", platform: "instagram" }] : [],
    images: { kept: [], removed: [], uploaded: [] },
  };
  const readingId = uuid();
  await t.deps.uow.repos.handoffs.update(scope, row!.id, {
    step: "done", readingId, readsUsed: options.readsUsed ?? 1,
    source: site ? { kind: "site", value: "https://cafeaurora.example", normalized: "https://cafeaurora.example/" } : { kind: "instagram", value: "@cafeaurora", normalized: "cafeaurora" },
    captured, decisions,
  });
  const taskIntentId = await requestDiagnosis(t, scope, row!.id, readingId);
  return { t, scope, workspaceId, accountId, approver, handoffId: row!.id, readingId, taskIntentId };
}

/** What `handoff_confirm_summary` (and the retry command) write: the task.requested event + its outbox row. */
export async function requestDiagnosis(t: TestDeps, scope: { workspaceId: string; accountId: string }, handoffId: string, readingId: string) {
  const data = { handoffId, readingId };
  const event = await t.deps.uow.repos.events.create(scope, { actorType: "system", actorId: "test", actorRole: "system",
    eventType: "task.requested", payload: { eventName: HANDOFF_DIAGNOSE_EVENT, data }, occurredAt: t.deps.clock.now() });
  await t.deps.uow.repos.taskOutbox.create(scope, { id: event.id, eventName: HANDOFF_DIAGNOSE_EVENT, data });
  return event.id;
}

/**
 * Intents of one reading are ordered by their timestamp; with a frozen clock every
 * intent shares one instant and the order falls back to the (random) uuid. Tests that
 * chain intents (retries) call this once so each command happens one second later.
 */
export function advancingClock(t: TestDeps, stepMs = 1_000) {
  let current = t.deps.clock.now().getTime();
  t.deps.clock = { now: () => new Date(current += stepMs) };
}
