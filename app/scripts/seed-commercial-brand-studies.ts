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
  assertCommercialStudiesSeedEnvironment,
  assertOriginalFiles,
  COMMERCIAL_STUDY_EMAIL,
  COMMERCIAL_STUDY_SLUGS,
  COMMERCIAL_STUDY_WORKSPACE,
  loadCommercialStudiesManifest,
  ownedProfileName,
  selectSignupLabWorkspace,
  type CommercialStudiesManifest,
  type CommercialStudySlug,
  type ResolvedCommercialStudies,
} from "./lib/commercial-studies";

const REPO_ROOT = path.resolve(__dirname, "../..");
const SOURCE_MANIFEST = "docs/commercial-studies/real-brands/manifest.json";
const MANIFEST_PATH = path.join(REPO_ROOT, SOURCE_MANIFEST);
const ORIGINALS_DIR = path.join(REPO_ROOT, "docs/commercial-studies/real-brands/originals");
const RESOLVED_PATH = path.join(
  REPO_ROOT,
  "docs/commercial-studies/real-brands/evidence/resolved-manifest.json",
);
const OWNED_PROFILE_CONSTRAINT = "Estudo interno. Sem afiliacao com a marca.";

type LabAccount = ResolvedCommercialStudies["account"];
type SeededStudy = ResolvedCommercialStudies["studies"][CommercialStudySlug];
type ManifestStudy = CommercialStudiesManifest["studies"][number];

const STUDY_BRAND_KIT: Record<CommercialStudySlug, BrandKitData> = {
  nike: {
    toneOfVoice:
      "Frase curta. Imperativo. Sem adjetivo institucional. O sistema fala pela ação, não pelo endosso da marca.",
    visualNotes:
      "A frase Just Do It como eixo verbal. Ação como argumento: o feito vale mais do que o retrato. Ponte, distância (17 milhas) e corpo em movimento como esqueleto da composição impressa. Corte seco, poucas palavras, sem explicação institucional.",
    requiredElements:
      "A frase Just Do It como eixo verbal; ação como argumento; ponte, distância e corpo em movimento; corte seco, poucas palavras.",
    prohibitedElements:
      "Semelhança de Walt Stack (rosto, idade, bigode); Swoosh colada como logo exato; fotografia da campanha copiada pixel a pixel; qualquer leitura de patrocínio, parceria ou aprovação da Nike.",
  },
  mtv: {
    toneOfVoice: "ID, não logo estático. Sem copy de slogan de rede; o gráfico carrega a identidade.",
    visualNotes:
      "Esqueleto M com TV pichado. Identidade mutável: a forma fica, a pele muda. Duração de ID, não de vinheta institucional longa.",
    requiredElements: "Esqueleto M com TV pichado; identidade mutável: a forma fica, a pele muda.",
    prohibitedElements:
      "Clipe com música ou trecho audiovisual com trilha; logotipo protegido colado como marca parada; frames de arquivo tratados como resultado gerado; qualquer leitura de patrocínio, parceria ou aprovação da MTV.",
  },
  absolut: {
    toneOfVoice: "Duas palavras: Absolut + conceito. Sem parágrafo de produto. O nome + o conceito bastam.",
    visualNotes:
      "Garrafa como âncora. O objeto manda; o fundo serve. Duas palavras: Absolut + conceito. Holofote e fundo escuro no anúncio de 1980. Série, não peça única.",
    requiredElements: "Garrafa como âncora; Absolut + conceito; holofote e fundo escuro no anúncio de 1980.",
    prohibitedElements:
      "Copy do halo como atalho de perfeição; silhueta, rótulo ou fotografia da garrafa tratados como resultado gerado; qualquer leitura de patrocínio, parceria ou aprovação da Absolut.",
  },
};

const STUDY_COPY: Record<CommercialStudySlug, SocialPostCopy> = {
  nike: {
    headline: "Just Do It",
    body: "Ação como argumento: o feito vale mais do que o retrato. Corte seco, poucas palavras, sem explicação institucional.",
    cta: "Just Do It",
  },
  mtv: {
    headline: "Network ID",
    body: "Esqueleto M com TV pichado. A forma fica, a pele muda. ID, não logo estático.",
    cta: "ID, não logo",
  },
  absolut: {
    headline: "Absolut Perfection",
    body: "Garrafa como âncora. O objeto manda; o fundo serve. Duas palavras: Absolut + conceito.",
    cta: "Absolut ______",
  },
};

const STUDY_ANALYSIS: Record<CommercialStudySlug, BrandTrainingAnalysis> = {
  nike: {
    description:
      "Print da ponte Just Do It 1988: composição, não retrato. A frase Just Do It como eixo verbal.",
    visualAttributes: ["ponte", "distância (17 milhas)", "corpo em movimento", "corte seco", "poucas palavras"],
    rules: [
      "Frase curta. Imperativo. Sem adjetivo institucional.",
      "O sistema fala pela ação, não pelo endosso da marca.",
      "Recriação: ponte, milhas, Just Do It — sem retratar Walt Stack.",
    ],
    constraints: [
      "Semelhança de Walt Stack (rosto, idade, bigode, identidade a preservar).",
      "Swoosh colada como logo exato.",
      "Fotografia da campanha copiada pixel a pixel como resultado.",
      "Qualquer leitura de patrocínio, parceria ou aprovação da Nike.",
    ],
    confidence: 1,
  },
  mtv: {
    description: "Still de Network ID: esqueleto M/TV, não clipe. A forma fica, a pele muda.",
    visualAttributes: ["esqueleto M", "TV pichado", "textura mutável", "duração de ID"],
    rules: [
      "ID, não logo estático.",
      "Recriação: um ID reconhecível como aquele esqueleto.",
      "Peça nova: o mesmo esqueleto, outra pele.",
    ],
    constraints: [
      "Clipe com música ou trecho audiovisual com trilha.",
      "Logotipo protegido colado como marca parada.",
      "Frames de arquivo tratados como resultado gerado.",
      "Qualquer leitura de patrocínio, parceria ou aprovação da MTV.",
    ],
    confidence: 1,
  },
  absolut: {
    description: "Anúncio Absolut Perfection 1980: treina o sistema, não o halo isolado.",
    visualAttributes: ["garrafa como âncora", "Absolut + conceito", "holofote", "fundo escuro"],
    rules: [
      "Recriação: garrafa, holofote e duas palavras, reconhecível como aquele sistema.",
      "Peça nova: Absolut ______. Copia a regra, não o halo.",
      "Sem parágrafo de produto. O nome + o conceito bastam.",
    ],
    constraints: [
      "Copy do halo como atalho de perfeição.",
      "Silhueta, rótulo ou fotografia da garrafa tratados como resultado gerado sem decisão de uso.",
      "Qualquer leitura de patrocínio, parceria ou aprovação da Absolut.",
    ],
    confidence: 1,
  },
};

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function resolveDedicatedLabWorkspace(): Promise<LabAccount> {
  let account = await db.select().from(user).where(eq(user.email, COMMERCIAL_STUDY_EMAIL)).limit(1);
  if (!account[0]) {
    const password = process.env.COMMERCIAL_STUDIES_PASSWORD;
    if (!password) {
      throw new Error("COMMERCIAL_STUDIES_PASSWORD is required to create the lab account");
    }
    await auth.api.signUpEmail({
      body: {
        email: COMMERCIAL_STUDY_EMAIL,
        password,
        name: "ADScale Estudos",
      },
    });
    account = await db.select().from(user).where(eq(user.email, COMMERCIAL_STUDY_EMAIL)).limit(1);
  }
  if (!account[0]) {
    throw new Error(`Could not create dedicated lab user ${COMMERCIAL_STUDY_EMAIL}.`);
  }
  await db
    .update(user)
    .set({
      emailVerified: true,
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
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

  const plan = selectSignupLabWorkspace(ownerWorkspaces, COMMERCIAL_STUDY_WORKSPACE);
  if (plan.rename) {
    await db
      .update(workspaces)
      .set({ name: COMMERCIAL_STUDY_WORKSPACE, updatedAt: new Date() })
      .where(eq(workspaces.id, plan.keepId));
  }
  if (plan.extraIds.length > 0) {
    await db
      .delete(workspaceMembers)
      .where(
        and(eq(workspaceMembers.userId, account[0].id), inArray(workspaceMembers.workspaceId, plan.extraIds)),
      );
    await db.delete(workspaces).where(inArray(workspaces.id, plan.extraIds));
  }

  await assertLabWorkspace(plan.keepId, account[0].id);
  const remaining = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, account[0].id), eq(workspaceMembers.role, "owner")));
  if (
    remaining.length !== 1 ||
    remaining[0].id !== plan.keepId ||
    remaining[0].name !== COMMERCIAL_STUDY_WORKSPACE
  ) {
    throw new Error("Lab account must have exactly one owner workspace named ADScale — Estudos Editoriais");
  }
  return { email: COMMERCIAL_STUDY_EMAIL, userId: account[0].id, workspaceId: plan.keepId };
}

async function assertLabWorkspace(workspaceId: string, userId: string): Promise<void> {
  const [row] = await db
    .select({
      name: workspaces.name,
      ownerEmail: user.email,
    })
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
  if (!row || row.name !== COMMERCIAL_STUDY_WORKSPACE || row.ownerEmail !== COMMERCIAL_STUDY_EMAIL) {
    throw new Error("Refusing to mutate a workspace that is not the dedicated commercial studies lab");
  }
}

async function clearOnlyOwnedStudyProfiles(workspaceId: string, userId: string): Promise<void> {
  await assertLabWorkspace(workspaceId, userId);
  const names = COMMERCIAL_STUDY_SLUGS.map((slug) => ownedProfileName(slug));
  await db
    .delete(clientProfiles)
    .where(and(eq(clientProfiles.workspaceId, workspaceId), inArray(clientProfiles.name, names)));
  await db
    .delete(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.workspaceId, workspaceId),
        like(workspaceAssets.key, `commercial-studies/${workspaceId.slice(0, 8)}/%`),
      ),
    );
}

async function seedStudy(account: LabAccount, study: ManifestStudy): Promise<SeededStudy> {
  const slug = study.slug;
  const profile = await createClientProfile(account.workspaceId, {
    name: ownedProfileName(slug),
    description: study.hypothesis,
    constraints: OWNED_PROFILE_CONSTRAINT,
  });
  await upsertBrandKit(
    account.workspaceId,
    {
      name: ownedProfileName(slug),
      description: study.hypothesis,
      constraints: OWNED_PROFILE_CONSTRAINT,
      ...STUDY_BRAND_KIT[slug],
    },
    profile.id,
  );

  const trainingReferenceIds: string[] = [];
  const originalAssetKeys: string[] = [];
  for (const original of study.originals) {
    if (!original.entersTraining) continue;
    const filePath = path.join(ORIGINALS_DIR, original.fileName);
    const buffer = readFileSync(filePath);
    const digest = createHash("sha256").update(buffer).digest("hex");
    if (digest !== original.sha256) {
      throw new Error(`sha256 mismatch for ${original.fileName}`);
    }
    const key = `commercial-studies/${account.workspaceId.slice(0, 8)}/${slug}/${original.fileName}`;
    const contentType = contentTypeFor(original.fileName);
    await objectStorage.put(key, buffer, contentType);
    const meta = await sharp(buffer).metadata();
    await createWorkspaceAsset({
      workspaceId: account.workspaceId,
      key,
      name: original.fileName,
      type: contentType,
      size: buffer.byteLength,
      width: meta.width,
      height: meta.height,
      source: "seed",
      metadata: {
        commercialStudy: true,
        originalId: original.id,
        sha256: original.sha256,
      },
    });
    const [reference] = await db
      .insert(clientReferences)
      .values({
        workspaceId: account.workspaceId,
        clientProfileId: profile.id,
        assetKey: key,
        label: original.id,
        kind: "other",
        notes: original.purpose ?? study.hypothesis,
        trainingCategory: "visual_reference",
        usageMode: "reference",
        reviewStatus: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: account.userId,
        trainingAnalysis: STUDY_ANALYSIS[slug],
      })
      .returning();
    trainingReferenceIds.push(reference.id);
    originalAssetKeys.push(key);
  }

  const work = await createCreativeWork({
    workspaceId: account.workspaceId,
    clientProfileId: profile.id,
    createdByUserId: account.userId,
    toolKind: "single",
    format: "4:5",
    brief: study.briefs.recreation,
  });
  await setCreativeWorkCopy(account.workspaceId, work.id, STUDY_COPY[slug]);
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
      objective: "Fixture de interface",
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
      objective: "Fixture de interface",
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
      objective: "Fixture de interface",
      audience: "",
      offer: null,
    },
  });
  await setCreativeWorkStatus(account.workspaceId, empty.id, "completed");

  return {
    clientProfileId: profile.id,
    creativeWorkId: work.id,
    freshBrief: study.briefs.fresh,
    trainingReferenceIds,
    originalAssetKeys,
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

function writeResolvedManifest(account: LabAccount, studies: ResolvedCommercialStudies["studies"]): void {
  const resolved: ResolvedCommercialStudies = {
    sourceManifest: SOURCE_MANIFEST,
    generatedAt: new Date().toISOString(),
    account,
    studies,
  };
  mkdirSync(path.dirname(RESOLVED_PATH), { recursive: true });
  writeFileSync(RESOLVED_PATH, `${JSON.stringify(resolved, null, 2)}\n`);
}

async function main(): Promise<void> {
  assertCommercialStudiesSeedEnvironment();
  const manifest = loadCommercialStudiesManifest(MANIFEST_PATH);
  assertOriginalFiles(manifest, ORIGINALS_DIR);
  const account = await resolveDedicatedLabWorkspace();
  await clearOnlyOwnedStudyProfiles(account.workspaceId, account.userId);
  const studies = {} as ResolvedCommercialStudies["studies"];
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
