/**
 * Pilot states by SQL (ticket 09).
 *
 * The brand handoff, the diagnosis and the first-open mesa depend on a site reader, an Instagram reader, Inngest and a
 * model. This script writes the state each step leaves behind straight into a THROWAWAY test database, so every step of
 * the pilot conversation can be opened (and screenshotted) on a local server without calling anything. The images are
 * synthetic and the brand is invented ("Café Aurora"); nothing is read from, or sent to, a real service.
 *
 * It needs a free account to exist for the e-mail: sign in once and open `/`.
 *
 *   cd app
 *   export TEST_DATABASE_URL=postgres://localhost:5432/some_throwaway_test   # must end with _test
 *   export E2E_STORAGE_DIR=/tmp/adscale-e2e-storage                           # the SAME value the server was started with
 *   npx tsx scripts/pilot-states.ts inspirations <email>        # five curated inspirations: the large mesa of the first open
 *   npx tsx scripts/pilot-states.ts handoff <email> <stage>
 *
 * Stages (each one is complete in itself: run them in any order, as often as needed):
 *   reset      first open: the opening line and the "site da marca" card (large mesa)
 *   answered   the person said something before giving the site: the same card, and the mesa goes compact
 *   reading    H2: the brand is being read (palette and logo found; networks and images still queued)
 *   identity   H3: name, logo, colors and fonts to check
 *   networks   H4: the social profiles to check
 *   images     H5: the images to choose
 *   summary    H6: the summary before "É isso"
 *   done       the Library is built ("Biblioteca montada · N itens") and the diagnosis is being made
 *   diagnosis  D1: the diagnosis card, after the Library line
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import sharp from "sharp";
import { DIAGNOSIS_BUILDING_TEXT } from "../src/lib/equipe/diagnosis-copy";
import { handoffText } from "../src/lib/equipe/handoff-copy";
import { LIBRARY_ASSEMBLED_EVENT } from "../src/server/equipe/handoff/contract";
import { diagnosisCardLine, diagnosisCardPayload } from "../src/server/equipe/handoff/diagnosis";
import { DIAGNOSIS_STARTED_EVENT, diagnosisContentSchema } from "../src/server/equipe/handoff/diagnosis-contract";

const STAGES = ["reset", "answered", "reading", "identity", "networks", "images", "summary", "done", "diagnosis"] as const;
type Stage = (typeof STAGES)[number];
type Step = "source" | "reading" | "identity" | "networks" | "images" | "summary" | "done";
const STEPS: Step[] = ["source", "reading", "identity", "networks", "images", "summary", "done"];
const STEP_OF: Record<Stage, Step> = {
  reset: "source", answered: "source", reading: "reading", identity: "identity", networks: "networks", images: "images",
  summary: "summary", done: "done", diagnosis: "done",
};
const VERSION_OF: Record<Step, number> = { source: 1, reading: 2, identity: 3, networks: 4, images: 5, summary: 6, done: 7 };

/** The command whose decision opened each step: the conversation shows it as a line ("Você confirmou as redes"). */
const DECIDED_BY: Partial<Record<Step, string>> = {
  reading: "handoff_set_source", networks: "handoff_confirm_identity", images: "handoff_confirm_networks",
  summary: "handoff_confirm_images", done: "handoff_confirm_summary",
};

type Ids = { workspaceId: string; accountId: string; profileId: string; handoffId: string; threadId: string };
type Item = { id: string; value: string; origin: "site" | "instagram"; platform?: string; key?: string; width?: number; height?: number };

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function config() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) fail("TEST_DATABASE_URL must point at a throwaway test database.");
  const database = new URL(url).pathname.replace(/^\//, "");
  if (!/_test$/.test(database)) fail(`Refusing to write into "${database}": the database name must end with _test.`);
  const storage = process.env.E2E_STORAGE_DIR?.trim();
  if (!storage) fail("E2E_STORAGE_DIR must be the directory the local server reads (the value it was started with).");
  return { url, storage: path.resolve(storage) };
}

// ── synthetic images (deterministic: the same run draws the same pictures) ─────────────────────────────────────────

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Scene = { width: number; height: number; base: [string, string]; palette: string[]; seed: number; blobs?: number; blur?: number; draw?: (next: () => number) => string };

async function picture({ width, height, base, palette, seed, blobs = 9, blur = 38, draw }: Scene): Promise<Buffer> {
  const next = random(seed);
  const between = (low: number, high: number) => Math.floor(low + next() * (high - low));
  const circles = Array.from({ length: blobs }, () => {
    const radius = between(width / 9, width / 3);
    return `<circle cx="${between(0, width)}" cy="${between(0, height)}" r="${radius}" fill="${palette[between(0, palette.length)]}" fill-opacity="${(between(110, 230) / 255).toFixed(2)}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base[0]}"/><stop offset="1" stop-color="${base[1]}"/></linearGradient>
      <filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter>
      <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed % 1000}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.08"/></feComponentTransfer></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <g filter="url(#b)">${circles}</g>
    ${draw ? draw(next) : ""}
    <rect width="100%" height="100%" filter="url(#n)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const SHAPES = {
  bag: (next: () => number) => `<rect x="120" y="520" width="640" height="560" rx="90" fill="#b89a6a"/>${
    Array.from({ length: 420 }, () => `<ellipse cx="${150 + next() * 580}" cy="${545 + next() * 150}" rx="7" ry="4.5" fill="${["#2b1a10", "#3a2416", "#1f130b"][Math.floor(next() * 3)]}"/>`).join("")}`,
  cup: () => `<rect x="250" y="560" width="380" height="340" rx="40" fill="#f1ebe1"/><ellipse cx="440" cy="572" rx="190" ry="52" fill="#3a2416"/><path d="M 618 640 A 70 90 0 0 1 618 790" fill="none" stroke="#f1ebe1" stroke-width="26"/>`,
  box: () => `<polygon points="160,700 440,600 720,700 440,800" fill="#caa46a"/><polygon points="160,700 440,800 440,1030 160,930" fill="#a8844f"/><polygon points="720,700 440,800 440,1030 720,930" fill="#b89460"/>${
    ["#2f6b4a", "#c9573a", "#2b4a7a"].map((color, index) => `<rect x="${250 + index * 120}" y="${470 - index * 14}" width="80" height="220" rx="14" fill="${color}"/>`).join("")}`,
  barista: () => `<ellipse cx="440" cy="430" rx="110" ry="110" fill="#d9b99a"/><rect x="250" y="540" width="380" height="560" rx="120" fill="#5b6b4a"/><rect x="300" y="800" width="280" height="80" rx="20" fill="#c9c3b8"/>`,
  none: () => "",
};

const photo = (name: string, shape: keyof typeof SHAPES, base: [string, string], palette: string[], seed: number) =>
  picture({ width: 880, height: 1100, base, palette, seed, draw: SHAPES[shape] }).then((png) => ({ name, png, width: 880, height: 1100 }));

async function logo() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
    <rect width="900" height="560" fill="#f4ede3"/>
    <path d="M 380 300 A 70 70 0 0 1 520 300 Z" fill="#c8782e"/>
    <rect x="330" y="316" width="240" height="10" rx="5" fill="#3a2114"/><rect x="370" y="340" width="160" height="10" rx="5" fill="#3a2114"/>
    <text x="450" y="440" fill="#3a2114" font-family="Georgia, 'Times New Roman', serif" font-size="96" font-weight="700" text-anchor="middle">café aurora</text>
  </svg>`;
  return { name: "logo", png: await sharp(Buffer.from(svg)).png().toBuffer(), width: 900, height: 560 };
}

const INSPIRATIONS: { title: string; base: [string, string]; palette: string[] }[] = [
  { title: "Novo drop. Mesma pegada.", base: ["#e31b1b", "#6e0707"], palette: ["#ffffff", "#111111", "#ff6a5a"] },
  { title: "Pele de manhã, sem esforço.", base: ["#f3f4f1", "#b9c2b5"], palette: ["#ffffff", "#6f8f6a", "#d9e2d3"] },
  { title: "Sexta pede smash duplo.", base: ["#14181c", "#4a2c12"], palette: ["#e8a33a", "#7a3f12", "#2b2f33"] },
  { title: "Corra antes da cidade acordar.", base: ["#f2c0a0", "#6d5446"], palette: ["#8a9a6a", "#e9d0b8", "#4a5a3a"] },
  { title: "Um cheiro que fica.", base: ["#e5eef3", "#97b1bf"], palette: ["#ffffff", "#5e7f94", "#1d2a33"] },
];

// ── database and storage ───────────────────────────────────────────────────────────────────────────────────────────

type Asset = { id: string; key: string };

class Workspace {
  constructor(readonly db: Client, readonly storage: string) {}

  async put(key: string, data: Buffer, contentType: string) {
    const file = path.join(this.storage, ...key.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType, contentLength: data.length }));
  }

  async asset(ids: { workspaceId: string; profileId?: string | null }, input: {
    name: string; key: string; type: string; data: Buffer; source: string; metadata: Record<string, unknown>; width?: number; height?: number;
  }): Promise<Asset> {
    await this.put(input.key, input.data, input.type);
    const { rows } = await this.db.query<{ id: string }>(
      `insert into adscale_app.workspace_assets (id, workspace_id, client_profile_id, name, key, type, size, width, height, source, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       on conflict (key) do update set name = excluded.name returning id`,
      [randomUUID(), ids.workspaceId, ids.profileId ?? null, input.name, input.key, input.type, input.data.length,
        input.width ?? null, input.height ?? null, input.source, JSON.stringify(input.metadata)],
    );
    return { id: rows[0]!.id, key: input.key };
  }

  async ids(email: string): Promise<Ids> {
    const { rows } = await this.db.query<{ workspace_id: string; account_id: string; profile_id: string; handoff_id: string; thread_id: string }>(
      `select m.workspace_id, a.id as account_id, a.client_profile_id as profile_id, h.id as handoff_id, t.assistant_thread_id as thread_id
         from adscale_app."user" u
         join adscale_app.workspace_members m on m.user_id = u.id
         join adscale_equipe.equipe_accounts a on a.workspace_id = m.workspace_id
         join adscale_equipe.equipe_brand_handoffs h on h.account_id = a.id
         join adscale_equipe.equipe_threads t on t.account_id = a.id and t.kind = 'primary'
        where u.email = $1 order by a.created_at limit 1`,
      [email],
    );
    const row = rows[0];
    if (!row) fail(`No free account for ${email}: sign in as that user and open / once, then run this again.`);
    return { workspaceId: row.workspace_id, accountId: row.account_id, profileId: row.profile_id, handoffId: row.handoff_id, threadId: row.thread_id };
  }
}

async function inspirations(w: Workspace, email: string) {
  const ids = await w.ids(email);
  for (const [index, entry] of INSPIRATIONS.entries()) {
    const data = await picture({ width: 800, height: 1000, base: entry.base, palette: entry.palette, seed: 100 + index, blobs: 7, blur: 50 });
    await w.asset({ workspaceId: ids.workspaceId }, {
      name: `${entry.title}.png`, key: `curated-inspirations/pilot-states-${ids.workspaceId.slice(0, 8)}-${index}.png`,
      type: "image/png", data, source: "curated_inspiration", metadata: {}, width: 800, height: 1000,
    });
  }
  console.log(`inspirations: ${INSPIRATIONS.length} curated cards in the workspace of ${email}`);
}

// ── the handoff ────────────────────────────────────────────────────────────────────────────────────────────────────

const SITE = { kind: "site", value: "cafeaurora.com.br", normalized: "https://cafeaurora.com.br/" };
const PUBLIC_PAGE = "# Café Aurora\nTorra própria, avulso e assinatura. Cafés especiais de origem única.";
const DIAGNOSIS = {
  status: "complete" as const,
  brand: "Café Aurora",
  summary: "A Café Aurora vende café especial de torra própria, avulso e por assinatura. O site conta a origem dos grãos; o Instagram mostra receitas. As duas histórias não se encontram.",
  channels: [
    { name: "Site" as const, source: "site" as const, message: "origem, produto e assinatura" },
    { name: "Instagram" as const, source: "instagram" as const, message: "receitas e bastidores, sem produto" },
  ],
  opportunities: [
    { title: "Levar a origem dos grãos para o Instagram", sources: ["site" as const, "instagram" as const] },
    { title: "Mostrar a assinatura nos posts (hoje só aparece no site)", sources: ["site" as const, "instagram" as const] },
    { title: "Unificar a paleta: o Instagram está mais escuro que o site", sources: ["site" as const, "instagram" as const] },
  ],
  notFound: ["público e preço médio"],
  // The excerpts behind the diagnosis, as the document keeps them (the "O que está escrito no seu site / Instagram" quotes, ticket 15 B). The first one is a
  // "Lorem ipsum" that really is on a site: the owner took it for something the AI wrote.
  sources: [
    { origin: "site" as const, supports: "summary", quote: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua." },
    { origin: "site" as const, supports: "channel:site", quote: "Torra própria, avulso e assinatura. Cafés especiais de origem única." },
    { origin: "instagram" as const, supports: "channel:instagram", quote: "Receita de hoje: coado de 18 g em 300 ml, 2 min 30 s. Salve para fazer em casa ☕" },
    { origin: "instagram" as const, supports: "opportunity:1", quote: "De onde vem o grão da semana: Fazenda Santa Clara, Cerrado Mineiro." },
    { origin: "site" as const, supports: "opportunity:2", quote: "Assine e receba em casa todo mês, com 15% de desconto na primeira caixa." },
  ],
};

async function handoff(w: Workspace, email: string, stage: Stage) {
  const ids = await w.ids(email);
  const { db } = w;
  const step = STEP_OF[stage];
  const at = process.env.PILOT_STATES_AT ? new Date(process.env.PILOT_STATES_AT) : new Date();
  if (Number.isNaN(at.getTime())) fail("PILOT_STATES_AT must be an ISO date.");

  await db.query("begin");
  try {
    // A stage stands alone: what an earlier stage staged (its assets, the Library's brand, a diagnosis) goes first.
    await db.query("delete from adscale_app.workspace_assets where workspace_id = $1 and metadata->>'handoffId' = $2", [ids.workspaceId, ids.handoffId]);
    await db.query("delete from adscale_equipe.equipe_brand_documents where account_id = $1", [ids.accountId]);
    await db.query(
      `update adscale_app.client_profiles set name = 'Minha marca', brand_colors = null, brand_fonts = null, logo_asset_key = null,
              website = null, instagram_handle = null, social_links = null where id = $1`,
      [ids.profileId],
    );

    const readingId = randomUUID();
    const intent = randomUUID();
    const run = (status: string) => ({ runId: randomUUID(), taskIntentId: intent, status });
    const staged = stage === "reset" || stage === "answered" ? null : await stageBrand(w, ids, readingId, step);

    const reading: Record<string, unknown> = {};
    let captured: Record<string, unknown> = {};
    let decisions: Record<string, unknown> = {};
    if (staged) {
      for (const group of ["name", "logo", "colors", "fonts", "networks", "images"]) reading[group] = run("found");
      captured = { name: [staged.name], logo: [staged.logo], colors: staged.colors, fonts: staged.fonts, networks: staged.networks, images: [...staged.site, ...staged.instagram], publicContent: [staged.page] };
      if (step === "reading" || step === "identity") {
        // Still reading: the identity groups are in, the networks and the images are not.
        reading.networks = run("running");
        reading.images = run("pending");
        captured = { name: [staged.name], logo: [staged.logo], colors: staged.colors, fonts: staged.fonts };
      } else {
        decisions = { identity: { name: staged.name, logo: staged.logo, colors: staged.colors, fonts: staged.fonts, paletteChoice: "site" } };
        if (step === "networks") { reading.images = run("running"); captured = { ...captured, images: [] }; }
        if (STEPS.indexOf(step) >= STEPS.indexOf("images")) decisions = { ...decisions, networks: staged.networks };
        if (STEPS.indexOf(step) >= STEPS.indexOf("summary")) {
          decisions = { ...decisions, images: { kept: staged.kept.filter((id) => id !== staged.logo.id), removed: [staged.removed.id], uploaded: [] } };
        }
      }
    }

    await db.query(
      `update adscale_equipe.equipe_brand_handoffs
          set step = $2, version = $3, source = $4::jsonb, reading_id = $5, reads_used = $6,
              reading = $7::jsonb, captured = $8::jsonb, decisions = $9::jsonb
        where id = $1`,
      [ids.handoffId, step, VERSION_OF[step], staged ? JSON.stringify(SITE) : null, staged ? readingId : null, staged ? 1 : 0,
        JSON.stringify(reading), JSON.stringify(captured), JSON.stringify(decisions)],
    );

    await conversation(w, ids, stage, at, staged?.libraryItems ?? 0, readingId);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  console.log(`handoff: ${email} is at "${stage}"`);
}

/** The reading's captures: provisional assets in the account's storage, like the reader leaves them. */
async function stageBrand(w: Workspace, ids: Ids, readingId: string, step: Step) {
  const base = `workspaces/${ids.workspaceId}/handoff/${ids.handoffId}/${readingId}`;
  // What the reader leaves: no brand yet (`client_profile_id` is null) and the handoff's own `provisional` metadata.
  const put = async (picture: { name: string; png: Buffer; width: number; height: number }, source: "brand_site" | "brand_instagram", kind: string): Promise<Item> => {
    const originUrl = source === "brand_site" ? `https://cafeaurora.com.br/${picture.name}.png` : `https://scontent.cdninstagram.com/${picture.name}.jpg`;
    const asset = await w.asset({ workspaceId: ids.workspaceId }, {
      name: `${picture.name}.png`, key: `${base}/${picture.name}.png`, type: "image/png", data: picture.png, source,
      metadata: { handoffId: ids.handoffId, readingId, provisional: true, originUrl, kind }, width: picture.width, height: picture.height,
    });
    return { id: asset.id, value: `/api/workspace/assets/${asset.id}/file`, origin: source === "brand_site" ? "site" : "instagram", key: asset.key, width: picture.width, height: picture.height };
  };

  const logoItem = await put(await logo(), "brand_site", "site_logo");
  const site = [
    await put(await photo("site-bag", "bag", ["#c99a5a", "#3a2416"], ["#f0c98a", "#5a3a1c", "#d8a35b"], 11), "brand_site", "site_image"),
    await put(await photo("site-cup", "cup", ["#e8d8c4", "#8a5a38"], ["#f5ebd8", "#b8793e", "#6b4226"], 12), "brand_site", "site_image"),
    await put(await photo("site-grinder", "none", ["#d9c7b0", "#3d2b1f"], ["#c8a27a", "#7a4e2a", "#efe3d0"], 13), "brand_site", "site_image"),
  ];
  const instagram = [
    await put(await photo("ig-box", "box", ["#d9b78a", "#5c3b22"], ["#e8d3b0", "#7a4a2a", "#c58a4a"], 21), "brand_instagram", "instagram_post"),
    await put(await photo("ig-barista", "barista", ["#e6d2bb", "#4c3a2c"], ["#b8c0a0", "#8b5a3a", "#f1e4d2"], 22), "brand_instagram", "instagram_post"),
    await put(await photo("ig-beans", "none", ["#6a4a32", "#1d130c"], ["#b9854a", "#3a2416", "#8a5a2e"], 23), "brand_instagram", "instagram_post"),
  ];
  const colors: Item[] = ["#3b2416", "#c8782e", "#f4ede3", "#1f3a2e"].map((value) => ({ id: randomUUID(), value, origin: "site" }));
  const fonts: Item[] = ["Fraunces", "Inter"].map((value) => ({ id: randomUUID(), value, origin: "site" }));
  const networks: Item[] = [
    { id: randomUUID(), value: "cafeaurora", origin: "site", platform: "instagram" },
    { id: randomUUID(), value: "https://facebook.com/cafeaurora", origin: "site", platform: "facebook" },
  ];
  const name: Item = { id: randomUUID(), value: "Café Aurora", origin: "site" };
  const page: Item = { id: randomUUID(), value: PUBLIC_PAGE, origin: "site" };
  const kept = [logoItem.id, ...site.map((item) => item.id), instagram[0]!.id, instagram[1]!.id];
  let libraryItems = 0;

  if (step === "done") {
    // "É isso": the kept images join the brand's Library, the site's text becomes a page, the profile takes the identity.
    await w.db.query("delete from adscale_app.workspace_assets where id = $1", [instagram[2]!.id]);
    await w.db.query(
      `update adscale_app.workspace_assets set client_profile_id = $2, metadata = metadata || '{"provisional": false}'::jsonb where id = any($1::uuid[])`,
      [kept, ids.profileId],
    );
    const text = Buffer.from(PUBLIC_PAGE);
    await w.asset({ workspaceId: ids.workspaceId, profileId: ids.profileId }, {
      name: "Café Aurora", key: `${base}/page.md`, type: "text/markdown", data: text, source: "brand_site",
      metadata: { kind: "site_page", title: "Café Aurora", originUrl: SITE.normalized, handoffId: ids.handoffId, readingId, provisional: false },
    });
    await w.db.query(
      `update adscale_app.client_profiles
          set name = 'Café Aurora', brand_colors = $2::jsonb, brand_fonts = $3::jsonb, logo_asset_key = $4, website = $5,
              instagram_handle = $6, social_links = $7::jsonb
        where id = $1`,
      [
        ids.profileId, JSON.stringify(colors.map((color) => color.value)), JSON.stringify(fonts.map((font) => font.value)), logoItem.key, SITE.normalized,
        networks.find((network) => network.platform === "instagram")?.value ?? null,
        JSON.stringify(networks.map((network) => ({ platform: network.platform ?? "other", value: network.value, origin: network.origin }))),
      ],
    );
    libraryItems = kept.length + 1;
  }
  return { logo: logoItem, site, instagram, colors, fonts, networks, name, page, kept, removed: instagram[2]!, libraryItems };
}

/** The conversation up to `stage`, written the way the server projects it (conversation-events.ts). */
async function conversation(w: Workspace, ids: Ids, stage: Stage, at: Date, libraryItems: number, readingId: string) {
  await w.db.query("delete from adscale_app.assistant_messages where thread_id = $1", [ids.threadId]);
  let sequence = 0;
  const add = async (type: string, content: string, payload: Record<string, unknown>) => {
    sequence += 1;
    await w.db.query(
      `insert into adscale_app.assistant_messages (id, workspace_id, thread_id, sequence, type, content, payload, created_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamp)`,
      // `created_at` has no time zone and the app reads it as UTC: write the UTC wall clock, whatever the session's zone.
      [randomUUID(), ids.workspaceId, ids.threadId, sequence, type, content, JSON.stringify(payload),
        new Date(at.getTime() + sequence * 1000).toISOString().replace("T", " ").replace("Z", "")],
    );
  };
  const card = (step: Step) => add("equipe_card", handoffText(step), { kind: "handoff", accountId: ids.accountId, handoffId: ids.handoffId, step, title: handoffText(step), items: [] });

  await add("assistant", handoffText("intro"), { handoffStep: "intro" });
  await card("source");
  if (stage === "answered") await add("user", "Quero conhecer o ADScale", {});
  const upTo = STEPS.indexOf(STEP_OF[stage]);
  for (const step of STEPS.slice(1, upTo + 1)) {
    const command = DECIDED_BY[step];
    if (command) {
      const text = `Você confirmou uma parte da marca · ${at.toISOString()}`;
      await add("equipe_event", text, { kind: "handoff.decided", text, command, step });
    }
    if (step === "done") {
      await add("equipe_event", `Biblioteca montada · ${libraryItems} itens`, { kind: LIBRARY_ASSEMBLED_EVENT, text: `Biblioteca montada · ${libraryItems} itens`, items: libraryItems });
      await add("assistant", handoffText("done"), { handoffStep: "done" });
      await add("equipe_event", DIAGNOSIS_BUILDING_TEXT, { kind: DIAGNOSIS_STARTED_EVENT, text: DIAGNOSIS_BUILDING_TEXT, actor: "system" });
    } else {
      await card(step);
    }
  }
  if (stage !== "diagnosis") return;

  const content = diagnosisContentSchema.parse({ ...DIAGNOSIS, meta: { readingId, taskIntentId: null, model: "synthetic", promptVersion: "pilot-states", inputSources: ["site", "instagram"] } });
  const documentId = randomUUID();
  await w.db.query(
    `insert into adscale_equipe.equipe_brand_documents (id, workspace_id, account_id, client_profile_id, kind, version, content, created_by_role)
     values ($1, $2, $3, $4, 'diagnosis', 1, $5::jsonb, 'research')`,
    [documentId, ids.workspaceId, ids.accountId, ids.profileId, JSON.stringify(content)],
  );
  await add("equipe_card", diagnosisCardLine(content), { ...diagnosisCardPayload({ accountId: ids.accountId, documentId, content, readsUsed: 1 }) });
}

async function main() {
  const [command, email, stage] = process.argv.slice(2);
  const { url, storage } = config();
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const w = new Workspace(db, storage);
    if (command === "inspirations" && email) await inspirations(w, email);
    else if (command === "handoff" && email && STAGES.includes(stage as Stage)) await handoff(w, email, stage as Stage);
    else fail(`Usage: tsx scripts/pilot-states.ts inspirations <email> | handoff <email> <${STAGES.join("|")}>`);
  } finally {
    await db.end();
  }
}

void main();
