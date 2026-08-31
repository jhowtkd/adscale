import "./load-env";

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, like } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import {
  clientProfiles,
  clientReferences,
  user,
  workspaceAssets,
  workspaceMembers,
  workspaces,
} from "../src/server/db/schema";
import { createClientProfile } from "../src/server/repositories/client-reference";
import { createWorkspaceAsset } from "../src/server/repositories/workspace-asset";
import { objectStorage } from "../src/server/storage";
import { upsertBrandKit, type BrandKitData } from "../src/server/repositories/brand-kit";
import { createIdentitySnapshot } from "../src/server/creative-work/identity";
import {
  confirmCreativeWorkIdentity,
  createCreativeWork,
  setCreativeWorkCopy,
  setCreativeWorkStatus,
} from "../src/server/repositories/creative-work";
import type { BrandTrainingAnalysis } from "../src/server/brand-training/contracts";
import type { SocialPostCopy } from "../src/server/creative-work/contracts";
import {
  assertClientAssetFiles,
  CLIENT_CASES_EMAIL,
  CLIENT_CASE_SLUGS,
  clientCaseProfileName,
  CLIENT_CASES_WORKSPACE,
  loadClientCasesManifest,
  type ClientCasesManifest,
  type ClientCaseSlug,
  type ResolvedClientCases,
} from "./lib/client-cases";

const REPO_ROOT = path.resolve(__dirname, "../..");
const SOURCE_MANIFEST = "docs/client-cases/manifest.json";
const MANIFEST_PATH = path.join(REPO_ROOT, SOURCE_MANIFEST);
const ASSETS_DIR = path.join(REPO_ROOT, "docs/client-cases/originals");
const RESOLVED_PATH = path.join(REPO_ROOT, "docs/client-cases/evidence/resolved-manifest.json");

type LabAccount = ResolvedClientCases["account"];
type SeededStudy = ResolvedClientCases["studies"][ClientCaseSlug];
type ManifestStudy = ClientCasesManifest["studies"][number];

const CASE_BRAND_KIT: Record<ClientCaseSlug, BrandKitData> = {
  nike: {
    toneOfVoice:
      "Energia de corrida. Frase curta, direta, orientada ao movimento. O produto é o herói e a ação acontece agora.",
    visualNotes:
      "Pegasus 41 como protagonista. Referências de campanha da marca orientam composição, tipografia e atmosfera. Corpo em movimento, produto visível, poucas palavras.",
    requiredElements: "Produto Pegasus 41 visível; identidade visual da marca respeitada; composição com energia de corrida.",
    prohibitedElements:
      "Alegações de desempenho sem fonte; preços, datas ou condições inventadas; distorção do produto; elementos de outras marcas.",
  },
  amazon: {
    toneOfVoice:
      "Simples, humano e no ritmo da entrega. Promessas concretas, sem jargão institucional.",
    visualNotes:
      "Universo da embalagem e da entrega: caixa kraft, fita laranja, sorriso da marca. Fotografia limpa, produto/embalagem como âncora, cores oficiais.",
    requiredElements: "Identidade visual da marca (cores e sorriso) respeitada; embalagem ou entrega presente como âncora.",
    prohibitedElements:
      "Alegações de preço, prazo ou oferta sem fonte; distorção do logotipo; elementos de outras marcas; tom agressivo de venda.",
  },
  "burger-king": {
    toneOfVoice:
      "Confiança gráfica do rebrand: tipografia groovy como protagonista, apetite em primeiro plano, humor sem excesso.",
    visualNotes:
      "Sistema gráfico do rebrand: embalagens com tipografia ondulada, paleta quente sobre fundo profundo. O produto embalado é a estrela; a marca fala pela forma.",
    requiredElements: "Sistema gráfico do rebrand respeitado (tipografia e paleta); produto embalado presente.",
    prohibitedElements:
      "Alegações nutricionais ou de preço sem fonte; uso do brasão antigo; distorção da tipografia do rebrand; elementos de outras marcas.",
  },
};

const CASE_COPY: Record<ClientCaseSlug, SocialPostCopy> = {
  nike: {
    headline: "Nike Pegasus 41",
    body: "O Pegasus 41 em movimento. Corrida como rotina, resposta imediata a cada passada.",
    cta: "Conheça o Pegasus 41",
  },
  amazon: {
    headline: "Amazon",
    body: "Do clique à porta. A embalagem que chega carrega a promessa inteira.",
    cta: "Explore a Amazon",
  },
  "burger-king": {
    headline: "Burger King",
    body: "O rebrand na mão: embalagens que falam pela forma e pelo apetite.",
    cta: "Conheça o novo BK",
  },
};

function analysisFor(study: ManifestStudy): BrandTrainingAnalysis {
  const attrs: Record<ClientCaseSlug, string[]> = {
    nike: ["produto protagonista", "energia de corrida", "composição de campanha", "poucas palavras"],
    amazon: ["embalagem kraft", "fita laranja", "sorriso da marca", "fotografia limpa"],
    "burger-king": ["tipografia groovy", "paleta quente", "fundo profundo", "produto embalado"],
  };
  return {
    description: `Material do cliente ${study.brand} (${study.focus}): referência de marca para composição de peças novas.`,
    visualAttributes: attrs[study.slug],
    rules: [
      "Transferir linguagem visual: composição, tipografia, cor e atmosfera.",
      "Não copiar peça existente pixel a pixel.",
      "O produto/marca protagonista permanece reconhecível.",
    ],
    constraints: [
      "Alegações sem fonte (desempenho, preço, prazo, nutrição).",
      "Distorção do logotipo ou da tipografia da marca.",
      "Elementos de outras marcas.",
    ],
    confidence: 1,
  };
}

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

export function assertClientCasesSeedEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const local = environment.NODE_ENV !== "production";
  const explicitlyEnabled = environment.COMMERCIAL_STUDIES_SEED === "true";
  const email = environment.COMMERCIAL_STUDIES_EMAIL ?? "";
  if (!local || !explicitlyEnabled || email !== CLIENT_CASES_EMAIL) {
    throw new Error("Client cases seed is development-only and requires estudos@example.test");
  }
}

async function resolveDedicatedLabWorkspace(): Promise<LabAccount> {
  let account = await db.select().from(user).where(eq(user.email, CLIENT_CASES_EMAIL)).limit(1);
  if (!account[0]) {
    const password = process.env.COMMERCIAL_STUDIES_PASSWORD;
    if (!password) {
      throw new Error("COMMERCIAL_STUDIES_PASSWORD is required to create the lab account");
    }
    await auth.api.signUpEmail({
      body: { email: CLIENT_CASES_EMAIL, password, name: "ADScale" },
    });
    account = await db.select().from(user).where(eq(user.email, CLIENT_CASES_EMAIL)).limit(1);
  }
  if (!account[0]) {
    throw new Error(`Could not create dedicated lab user ${CLIENT_CASES_EMAIL}.`);
  }
  await db
    .update(user)
    .set({ emailVerified: true, onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(user.id, account[0].id));

  const ownerWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      membershipCreatedAt: workspaceMembers.createdAt,
    })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, account[0].id), eq(workspaceMembers.role, "owner")));

  const owned = ownerWorkspaces.filter((w) => w.name === CLIENT_CASES_WORKSPACE);
  if (owned.length !== 1) {
    throw new Error(`Lab account must have exactly one owner workspace named ${CLIENT_CASES_WORKSPACE}`);
  }
  return { email: CLIENT_CASES_EMAIL, userId: account[0].id, workspaceId: owned[0].id };
}

async function assertLabWorkspace(workspaceId: string, userId: string): Promise<void> {
  const [row] = await db
    .select({ name: workspaces.name, ownerEmail: user.email })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .innerJoin(user, eq(user.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.role, "owner"),
      ),
    )
    .limit(1);
  if (!row || row.name !== CLIENT_CASES_WORKSPACE || row.ownerEmail !== CLIENT_CASES_EMAIL) {
    throw new Error("Refusing to mutate a workspace that is not the dedicated client cases lab");
  }
}

async function clearOnlyOwnedCaseProfiles(workspaceId: string, userId: string): Promise<void> {
  await assertLabWorkspace(workspaceId, userId);
  const names = CLIENT_CASE_SLUGS.map((slug) => clientCaseProfileName(slug));
  await db
    .delete(clientProfiles)
    .where(and(eq(clientProfiles.workspaceId, workspaceId), inArray(clientProfiles.name, names)));
  await db
    .delete(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.workspaceId, workspaceId),
        like(workspaceAssets.key, `client-cases/${workspaceId.slice(0, 8)}/%`),
      ),
    );
}

async function seedStudy(account: LabAccount, study: ManifestStudy): Promise<SeededStudy> {
  const slug = study.slug;
  const profile = await createClientProfile(account.workspaceId, {
    name: study.profileName,
    description: study.focus,
    constraints: "Uso comercial autorizado pelo cliente.",
  });
  await upsertBrandKit(
    account.workspaceId,
    {
      name: study.profileName,
      description: study.focus,
      constraints: "Uso comercial autorizado pelo cliente.",
      ...CASE_BRAND_KIT[slug],
    },
    profile.id,
  );

  const trainingReferenceIds: string[] = [];
  const assetKeys: string[] = [];
  for (const asset of study.assets) {
    const filePath = path.join(ASSETS_DIR, slug, asset.fileName);
    const buffer = readFileSync(filePath);
    const digest = createHash("sha256").update(buffer).digest("hex");
    if (digest !== asset.sha256) {
      throw new Error(`sha256 mismatch for ${slug}/${asset.fileName}`);
    }
    const key = `client-cases/${account.workspaceId.slice(0, 8)}/${slug}/${asset.fileName}`;
    const contentType = contentTypeFor(asset.fileName);
    await objectStorage.put(key, buffer, contentType);
    const meta = await sharp(buffer).metadata();
    await createWorkspaceAsset({
      workspaceId: account.workspaceId,
      key,
      name: asset.fileName,
      type: contentType,
      size: buffer.byteLength,
      width: meta.width,
      height: meta.height,
      source: "seed",
      metadata: {
        clientCase: true,
        assetId: asset.id,
        sha256: asset.sha256,
      },
    });
    const [reference] = await db
      .insert(clientReferences)
      .values({
        workspaceId: account.workspaceId,
        clientProfileId: profile.id,
        assetKey: key,
        label: asset.id,
        kind: "other",
        notes: `Material do cliente ${study.brand} — ${study.focus}`,
        trainingCategory: "visual_reference",
        usageMode: "reference",
        reviewStatus: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: account.userId,
        trainingAnalysis: analysisFor(study),
      })
      .returning();
    trainingReferenceIds.push(reference.id);
    assetKeys.push(key);
  }

  const work = await createCreativeWork({
    workspaceId: account.workspaceId,
    clientProfileId: profile.id,
    createdByUserId: account.userId,
    toolKind: "single",
    format: "4:5",
    brief: study.briefs.primary,
  });
  await setCreativeWorkCopy(account.workspaceId, work.id, CASE_COPY[slug]);
  const snapshot = await createIdentitySnapshot({
    workspaceId: account.workspaceId,
    clientProfileId: profile.id,
    selectedReferenceIds: trainingReferenceIds,
  });
  await confirmCreativeWorkIdentity(account.workspaceId, work.id, snapshot);
  await setCreativeWorkStatus(account.workspaceId, work.id, "draft");

  const generating = await createCreativeWork({
    workspaceId: account.workspaceId,
    clientProfileId: profile.id,
    createdByUserId: account.userId,
    toolKind: "single",
    format: "4:5",
    brief: {
      theme: `${study.brand} — controlled UI generating`,
      objective: "Estado de interface",
      audience: "",
      offer: null,
    },
  });
  await setCreativeWorkStatus(account.workspaceId, generating.id, "generating");

  const failed = await createCreativeWork({
    workspaceId: account.workspaceId,
    clientProfileId: profile.id,
    createdByUserId: account.userId,
    toolKind: "single",
    format: "4:5",
    brief: {
      theme: `${study.brand} — controlled UI failed`,
      objective: "Estado de interface",
      audience: "",
      offer: null,
    },
  });
  await setCreativeWorkStatus(account.workspaceId, failed.id, "failed");

  const empty = await createCreativeWork({
    workspaceId: account.workspaceId,
    clientProfileId: profile.id,
    createdByUserId: account.userId,
    toolKind: "single",
    format: "4:5",
    brief: {
      theme: `${study.brand} — controlled UI empty`,
      objective: "Estado de interface",
      audience: "",
      offer: null,
    },
  });
  await setCreativeWorkStatus(account.workspaceId, empty.id, "completed");

  return {
    clientProfileId: profile.id,
    creativeWorkId: work.id,
    trainingReferenceIds,
    assetKeys,
    selectedRealOutputIds: [],
    routes: {
      brandTraining: "/brand-kit",
      creativeWork: `/creative-work/${work.id}`,
      library: "/library",
    },
    controlledUi: {
      generating: generating.id,
      failed: failed.id,
      empty: empty.id,
    },
  };
}

function writeResolvedManifest(account: LabAccount, studies: ResolvedClientCases["studies"]): void {
  const resolved: ResolvedClientCases = {
    sourceManifest: SOURCE_MANIFEST,
    generatedAt: new Date().toISOString(),
    account,
    studies,
  };
  mkdirSync(path.dirname(RESOLVED_PATH), { recursive: true });
  writeFileSync(RESOLVED_PATH, `${JSON.stringify(resolved, null, 2)}\n`);
}

async function main(): Promise<void> {
  assertClientCasesSeedEnvironment();
  const manifest = loadClientCasesManifest(MANIFEST_PATH);
  assertClientAssetFiles(manifest, ASSETS_DIR);
  const account = await resolveDedicatedLabWorkspace();
  await clearOnlyOwnedCaseProfiles(account.workspaceId, account.userId);
  const studies = {} as ResolvedClientCases["studies"];
  for (const study of manifest.studies) {
    studies[study.slug] = await seedStudy(account, study);
  }
  writeResolvedManifest(account, studies);
  console.log(
    JSON.stringify(
      {
        workspaceId: account.workspaceId,
        profiles: Object.values(studies).map((study) => study.clientProfileId),
        studyWorks: Object.values(studies).map((study) => study.creativeWorkId),
        trainingReferenceCounts: Object.fromEntries(
          Object.entries(studies).map(([slug, study]) => [slug, study.trainingReferenceIds.length]),
        ),
      },
      null,
      2,
    ),
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
