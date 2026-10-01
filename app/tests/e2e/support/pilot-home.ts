import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, type Page } from "@playwright/test";
import { VISUAL_EMAIL } from "./visual-auth";

// Shared by the pilot home specs (gate on): open the free account as the visual identity, seed the handoff state and
// the conversation by SQL (never by sending a chat message or reading a site), and run axe.

export const AXE_PATH = path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js");
export const INTRO_TEXT = "Oi! Sou o Estrategista do ADScale. Antes de criar qualquer coisa, vou conhecer a sua marca.";

export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("TEST_DATABASE_URL must point at the database of the server under test");
  const db = new Client({ connectionString });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export type PilotContext = {
  workspaceId: string;
  accountId: string;
  clientProfileId: string;
  handoffId: string;
  threadId: string;
};

/** The free account of the visual identity. It exists once `/` was opened while signed in. */
export async function pilotContext(db: Client): Promise<PilotContext> {
  const { rows } = await db.query<{ workspace_id: string; account_id: string; client_profile_id: string; handoff_id: string; thread_id: string }>(
    `select m.workspace_id, a.id as account_id, a.client_profile_id, h.id as handoff_id, t.assistant_thread_id as thread_id
       from adscale_app."user" u
       join adscale_app.workspace_members m on m.user_id = u.id
       join adscale_equipe.equipe_accounts a on a.workspace_id = m.workspace_id
       join adscale_equipe.equipe_brand_handoffs h on h.account_id = a.id
       join adscale_equipe.equipe_threads t on t.account_id = a.id and t.kind = 'primary'
      where u.email = $1 order by a.created_at limit 1`,
    [VISUAL_EMAIL],
  );
  if (rows.length === 0) throw new Error("no free account for the visual identity: open / once while signed in");
  const row = rows[0]!;
  return {
    workspaceId: row.workspace_id, accountId: row.account_id, clientProfileId: row.client_profile_id,
    handoffId: row.handoff_id, threadId: row.thread_id,
  };
}

export type Stage = "opening" | "answered" | "reading";

/**
 * Puts the main conversation in a known state:
 *   opening  → source step, nothing read: only the Strategist's opening line and the first card (the large mesa)
 *   answered → the same, plus one message from the person (the compact mesa, still on inspirations)
 *   reading  → the site is being read: a palette is captured, the logo and the images are still queued
 */
export async function seedStage(db: Client, ctx: PilotContext, stage: Stage): Promise<void> {
  const reading = stage === "reading";
  if (reading) {
    const run = (status: string) => ({ runId: randomUUID(), taskIntentId: randomUUID(), status });
    const colors = ["#3b2416", "#c8782e", "#f4ede3"].map((value) => ({ id: randomUUID(), value, origin: "site" }));
    await db.query(
      `update adscale_equipe.equipe_brand_handoffs
          set step = 'reading', version = 2, reads_used = 1, reading_id = $2,
              source = $3::jsonb, reading = $4::jsonb, captured = $5::jsonb, decisions = '{}'::jsonb
        where id = $1`,
      [
        ctx.handoffId, randomUUID(),
        JSON.stringify({ kind: "site", value: "cafeaurora.com.br", normalized: "https://cafeaurora.com.br/" }),
        JSON.stringify({ logo: run("running"), images: run("running"), colors: { ...run("found") } }),
        JSON.stringify({ colors }),
      ],
    );
  } else {
    await db.query(
      `update adscale_equipe.equipe_brand_handoffs
          set step = 'source', version = 1, reads_used = 0, reading_id = null, source = null,
              reading = '{}'::jsonb, captured = '{}'::jsonb, decisions = '{}'::jsonb
        where id = $1`,
      [ctx.handoffId],
    );
  }
  await db.query("delete from adscale_app.assistant_messages where thread_id = $1", [ctx.threadId]);
  let sequence = 0;
  const add = async (type: string, content: string, payload: Record<string, unknown>) => {
    sequence += 1;
    await db.query(
      `insert into adscale_app.assistant_messages (id, workspace_id, thread_id, sequence, type, content, payload, created_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [randomUUID(), ctx.workspaceId, ctx.threadId, sequence, type, content, JSON.stringify(payload), new Date(Date.now() + sequence * 1000)],
    );
  };
  const card = (step: string) => add("equipe_card", "", {
    kind: "handoff", accountId: ctx.accountId, handoffId: ctx.handoffId, step, title: step, items: [],
  });
  await add("assistant", INTRO_TEXT, { handoffStep: "intro" });
  await card("source");
  if (stage === "answered") await add("user", "Quero conhecer o ADScale", {});
  if (reading) {
    await add("user", "cafeaurora.com.br", {});
    await add("equipe_event", "Você informou a fonte da marca", {
      kind: "handoff.decided", text: "Você informou a fonte da marca", command: "handoff_set_source", step: "reading",
    });
    await card("reading");
  }
}

/** What GET /api/creative-work?view=inspirations answers, so the first-open mesa has cards without seeding the catalog. */
export async function mockInspirations(page: Page, count = 5): Promise<void> {
  const pixel = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50"><rect width="40" height="50" fill="#444"/></svg>',
  );
  await page.route(/\/api\/creative-work\?view=inspirations/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        inspirations: Array.from({ length: count }, (_, index) => ({
          id: `insp-${index}`, title: `Inspiração ${index + 1}`, previewUrl: pixel,
        })),
        nextCursor: null,
      }),
    }),
  );
}

/** Opens the home with the pilot gate on and returns once the conversation is fully loaded. */
export async function openPilotHome(page: Page, url = "/"): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId("conversation-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("assistant-chat-input")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Carregando conversa…")).toHaveCount(0);
}

export async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: /^Aceitar todos$|^Accept all$/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

export type AxeFinding = { id: string; impact: string | null | undefined; nodes: { target: string[]; html: string }[] };

/** wcag2a + wcag2aa, like the visual a11y gate. */
export async function runAxe(page: Page): Promise<AxeFinding[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error injected by axe-core
    const results = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    return results.violations.map((violation: AxeFinding & { nodes: { target: string[]; html: string }[] }) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.slice(0, 3).map((node) => ({ target: node.target, html: node.html.slice(0, 200) })),
    }));
  });
}
