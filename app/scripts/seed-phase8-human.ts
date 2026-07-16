/**
 * Deterministic context for Phase 8 human-operated journeys.
 *
 * This seed prepares brands and resumable entry points only. It deliberately
 * does not generate outputs or record journey evidence: those actions must be
 * performed by a human participant and observed during the session.
 *
 * Writes: app/tests/fixtures/phase8-human.json (gitignored)
 * Usage: npm run seed:phase8-human
 */
import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { and, eq, like } from "drizzle-orm";

import { db } from "../src/server/db";
import {
  campaignTemplates,
  campaigns,
  clientProfiles,
  creativeWorkItems,
  user,
  workspaceMembers,
} from "../src/server/db/schema";
import { createIdentitySnapshot } from "../src/server/creative-work/identity";
import { upsertBrandKit } from "../src/server/repositories/brand-kit";
import { createCampaign } from "../src/server/repositories/campaign";
import { createClientProfile } from "../src/server/repositories/client-reference";
import {
  confirmCreativeWorkIdentity,
  createCreativeWork,
  setCreativeWorkCopy,
} from "../src/server/repositories/creative-work";
import { createTemplate } from "../src/server/repositories/template";

const DEV_EMAIL = "dev-admin@adscale.local";
const PREFIX = "Phase8 Human";
const FIXTURE_PATH = path.resolve(__dirname, "../tests/fixtures/phase8-human.json");

const BRANDS = [
  {
    key: "education",
    name: `${PREFIX} Horizonte Educacao`,
    segment: "educacao",
    description: "Cursos online de reforco para estudantes do ensino medio.",
    visualNotes: "Fotografia humana, composicao clara e bastante espaco negativo.",
    toneNotes: "Didatico, acolhedor e confiante; sem promessas absolutas.",
    constraints: "Nao usar linguagem infantil nem garantir aprovacao.",
    brandColors: ["#12355B", "#F4C95D", "#F7F9FC"],
    toneOfVoice: "claro, acolhedor e confiavel",
    prohibitedElements: "promessas de resultado garantido; linguagem infantil",
    requiredElements: "beneficio concreto; chamada para conhecer a aula",
  },
  {
    key: "food_retail",
    name: `${PREFIX} Cafe Aurora`,
    segment: "alimentacao e varejo",
    description: "Cafeteria de bairro com graos especiais e entrega local.",
    visualNotes: "Texturas naturais, luz quente e produto em primeiro plano.",
    toneNotes: "Proximo, sensorial e direto; sem tom gourmet inacessivel.",
    constraints: "Nao usar selos falsos, descontos inventados ou termos em ingles sem necessidade.",
    brandColors: ["#5A3A2E", "#F3E9DC", "#D08C60"],
    toneOfVoice: "proximo, sensorial e simples",
    prohibitedElements: "descontos nao informados; selos de premio; excesso de ingles",
    requiredElements: "produto visivel; retirada ou entrega local; CTA direto",
  },
  {
    key: "fitness_service",
    name: `${PREFIX} Studio Pulso`,
    segment: "fitness e servicos",
    description: "Estudio de treinamento funcional para adultos com rotina corrida.",
    visualNotes: "Alto contraste, movimento real e pessoas diversas.",
    toneNotes: "Energetico e respeitoso, sem culpa corporal.",
    constraints: "Nao prometer transformacao rapida nem usar antes e depois.",
    brandColors: ["#D7263D", "#111111", "#F5F5F5"],
    toneOfVoice: "energico, inclusivo e objetivo",
    prohibitedElements: "antes e depois; culpa corporal; resultados garantidos",
    requiredElements: "convite para aula experimental; pessoas diversas",
  },
] as const;

async function resolveDevWorkspace() {
  const [account] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEV_EMAIL))
    .limit(1);
  if (!account) {
    throw new Error(`No user ${DEV_EMAIL}. Run npm run seed:dev-admin -- --create first.`);
  }

  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, account.id))
    .limit(1);
  if (!membership) throw new Error(`User ${DEV_EMAIL} has no workspace.`);
  return { userId: account.id, workspaceId: membership.workspaceId };
}

async function clearPrevious(workspaceId: string) {
  await db
    .delete(campaignTemplates)
    .where(
      and(
        eq(campaignTemplates.workspaceId, workspaceId),
        like(campaignTemplates.name, `${PREFIX}%`)
      )
    );

  const previousCampaigns = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(eq(campaigns.workspaceId, workspaceId), like(campaigns.name, `${PREFIX}%`))
    );
  for (const campaign of previousCampaigns) {
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
  }

  const previousProfiles = await db
    .select({ id: clientProfiles.id })
    .from(clientProfiles)
    .where(
      and(
        eq(clientProfiles.workspaceId, workspaceId),
        like(clientProfiles.name, `${PREFIX}%`)
      )
    );
  for (const profile of previousProfiles) {
    await db.delete(creativeWorkItems).where(eq(creativeWorkItems.clientProfileId, profile.id));
    await db.delete(clientProfiles).where(eq(clientProfiles.id, profile.id));
  }
}

async function main() {
  const { userId, workspaceId } = await resolveDevWorkspace();
  await clearPrevious(workspaceId);

  const profiles = [];
  for (const brand of BRANDS) {
    const profile = await createClientProfile(workspaceId, {
      name: brand.name,
      description: brand.description,
      visualNotes: brand.visualNotes,
      toneNotes: brand.toneNotes,
      constraints: brand.constraints,
    });
    await upsertBrandKit(
      workspaceId,
      {
        name: brand.name,
        description: brand.description,
        visualNotes: brand.visualNotes,
        toneNotes: brand.toneNotes,
        constraints: brand.constraints,
        brandColors: [...brand.brandColors],
        brandFonts: ["Inter"],
        toneOfVoice: brand.toneOfVoice,
        prohibitedElements: brand.prohibitedElements,
        requiredElements: brand.requiredElements,
      },
      profile.id
    );
    profiles.push({ ...brand, id: profile.id });
  }

  const education = profiles[0];
  const cafe = profiles[1];
  const studio = profiles[2];

  const templateSource = await createCampaign(workspaceId, {
    name: `${PREFIX} Fonte Template Educacao`,
    client: education.name,
    clientProfileId: education.id,
    product: "Plano de reforco para vestibular",
    objective: "Gerar inscricoes para uma aula demonstrativa",
    audience: "Estudantes do ensino medio e seus responsaveis",
    platforms: ["meta_feed", "instagram_story"],
    tone: "acolhedor e confiante",
    offer: "Aula demonstrativa gratuita",
    constraints: education.constraints,
    ctaVariants: ["Conheca a aula", "Agende uma demonstracao"],
    targetFormats: ["1:1", "9:16"],
    status: "draft",
  });
  const template = await createTemplate({
    workspaceId,
    name: `${PREFIX} Template Aula Demonstrativa`,
    description: "Template deterministico para o cenario C02 da Fase 8.",
    campaignId: templateSource.id,
  });

  const resumableCampaign = await createCampaign(workspaceId, {
    name: `${PREFIX} Cafe Aurora Retomada`,
    client: cafe.name,
    clientProfileId: cafe.id,
    product: "Combo cafe coado e pao de queijo",
    objective: "Aumentar pedidos no horario da tarde",
    audience: "Pessoas que trabalham ou moram no bairro",
    platforms: ["instagram_feed"],
    tone: "proximo e sensorial",
    offer: "Entrega local no mesmo dia",
    constraints: cafe.constraints,
    ctaVariants: ["Peca agora"],
    targetFormats: ["1:1"],
    status: "draft",
  });

  const assistantCampaign = await createCampaign(workspaceId, {
    name: `${PREFIX} Studio Pulso Assistente`,
    client: studio.name,
    clientProfileId: studio.id,
    product: "Aula experimental de funcional",
    objective: "Gerar agendamentos para aula experimental",
    audience: "Adultos com pouco tempo para treinar",
    platforms: ["instagram_story"],
    tone: "energico e inclusivo",
    offer: "Primeira aula experimental",
    constraints: studio.constraints,
    ctaVariants: ["Agende sua aula"],
    targetFormats: ["9:16"],
    status: "draft",
  });

  const resumablePost = await createCreativeWork({
    workspaceId,
    clientProfileId: cafe.id,
    createdByUserId: userId,
    toolKind: "social_post",
    format: "1:1",
    brief: {
      theme: "Pausa da tarde com entrega local",
      objective: "Gerar pedidos do combo da tarde",
      audience: "Pessoas do bairro em horario de trabalho",
      offer: "Combo cafe coado e pao de queijo",
    },
  });
  await setCreativeWorkCopy(workspaceId, resumablePost.id, {
    headline: "Sua pausa da tarde chegou",
    body: "Um cafe coado e pao de queijo entregues perto de voce.",
    cta: "Peca agora",
  });
  const identity = await createIdentitySnapshot({
    workspaceId,
    clientProfileId: cafe.id,
    selectedReferenceIds: [],
  });
  await confirmCreativeWorkIdentity(workspaceId, resumablePost.id, identity);

  const fixture = {
    schemaVersion: 1,
    email: DEV_EMAIL,
    workspaceId,
    userId,
    brands: profiles.map(({ key, id, name, segment }) => ({ key, id, name, segment })),
    template: { id: template.id, name: template.name },
    templateSourceCampaignId: templateSource.id,
    resumableCampaign: {
      id: resumableCampaign.id,
      name: resumableCampaign.name,
      href: `/campaigns/${resumableCampaign.id}`,
    },
    assistantCampaign: {
      id: assistantCampaign.id,
      name: assistantCampaign.name,
      href: `/campaigns/${assistantCampaign.id}`,
    },
    resumablePost: {
      id: resumablePost.id,
      href: `/quick-tools/create-post?workId=${resumablePost.id}`,
    },
    scenarioBriefs: {
      C01: "Horizonte Educacao: divulgar aula demonstrativa para vestibulandos.",
      C02: "Materializar o template Aula Demonstrativa e finalizar a peca.",
      C03: "Cafe Aurora: promover o combo da tarde com entrega local.",
      C04: "Studio Pulso: criar pelo Assistente uma peca para aula experimental.",
      C05: "Retomar a campanha Cafe Aurora e concluir a entrega.",
      N01: "Horizonte Educacao: criar post sobre a aula demonstrativa.",
      N02: "Cafe Aurora: criar post mobile para o combo da tarde.",
      N03: "Studio Pulso: usar o Assistente sem campanha para divulgar aula experimental.",
      N04: "Studio Pulso: partir da Home e criar um post para pessoas com rotina corrida.",
      N05: "Retomar o post Cafe Aurora e concluir a entrega.",
    },
    seededAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  console.log("[seed-phase8-human]", fixture);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
