import { V6_SURFACE_GRADIENTS } from "@/lib/v6-surface-gradients";

export const previewUser = {
  firstName: "Jhonatan",
  lastName: "Soares",
  email: "jhonatan.marcela@gmail.com",
  credits: 142,
};

export const previewBilling = {
  planName: "Plano Piloto",
  billingCycle: "Mensal",
  planPrice: "R$ 0",
  renewalDate: "14 dias",
  features: [],
  creditsUsed: 358,
  creditsTotal: 500,
};

export const previewHeroMeta = {
  briefingProgress: 100,
  variationsDone: 17,
  variationsTotal: 24,
  approved: 9,
  credits: 142,
};

export const previewKpis = [
  { label: "Campanhas ativas", value: "12", trend: "+3 essa semana", trendDir: "up" as const },
  { label: "Variações geradas", value: "847", trend: "+142 vs semana passada", trendDir: "up" as const },
  { label: "Taxa de aprovação", value: "68%", trend: "12% acima do baseline", trendDir: "neutral" as const },
  { label: "Créditos restantes", value: "2.4k", trend: "Renova em 14 dias", trendDir: "neutral" as const },
];

export const previewActivity = [
  { thumb: "🌿", name: "Verão 2024 — Natura", author: "Jhonatan Soares", updated: "2 min", status: "Gerando", statusClass: "running", platforms: "IG, FB", variations: "17 / 24" },
  { thumb: "🥤", name: "Lançamento Verão — DoBem", author: "Jhonatan Soares", updated: "18 min", status: "Em revisão", statusClass: "review", platforms: "IG, TT", variations: "12 / 12" },
  { thumb: "💊", name: "Black Friday — Far.me", author: "Jhonatan Soares", updated: "1h", status: "Aprovada", statusClass: "approved", platforms: "FB, GL", variations: "48 / 48" },
  { thumb: "🎯", name: "Retenção Q4 — SaaS interno", author: "Jhonatan Soares", updated: "3h", status: "Aprovada", statusClass: "approved", platforms: "LI", variations: "24 / 24" },
];

export const previewRecipes = [
  { icon: "🧪", name: "Awareness → Awareness Verão", desc: "Variáveis: tom, paleta, plataforma. 8 derivações.", count: "8 vars" },
  { icon: "🧪", name: "Conversão Direta — Skincare", desc: "CTA forte + prova + oferta. 12 derivações.", count: "12 vars" },
  { icon: "🧪", name: "Retenção Q4 — SaaS", desc: "Reabordagem de carrinho abandonado. 6 derivações.", count: "6 vars" },
  { icon: "🧪", name: "Awareness Feminino 25-40", desc: "Inspirador, lifestyle, prova social. 16 derivações.", count: "16 vars" },
];

export const previewBriefingRows = [
  { key: "Objetivo", value: "Awareness de lançamento" },
  { key: "Público", value: "Mulheres 25-40, skincare natural" },
  { key: "Tom", value: "Inspirador e natural" },
  { key: "Plataformas", value: "Instagram, Facebook" },
  { key: "CTA", value: "Descubra a linha" },
  { key: "Restrições", value: "Manter identidade visual orgânica" },
];

export const previewCampaignList = [
  { initials: "CB", name: "Cenbrap em Dobro - Teste", variations: 12, approved: 11, status: "Concluída", statusClass: "success" as const, updated: "há 2 dias" },
  { initials: "T5", name: "Teste 5", variations: 6, approved: 3, status: "Piloto", statusClass: "warning" as const, updated: "há 1 dia" },
  { initials: "CB", name: "Cenbrap em Dobro", variations: 18, approved: 16, status: "Aprovada", statusClass: "info" as const, updated: "há 4 dias" },
  { initials: "NR1", name: "Cenbrap NR1", variations: 3, approved: 2, status: "Rascunho", statusClass: "neutral" as const, updated: "há 1 semana" },
  { initials: "VN", name: "Verão 2024 — Natura", variations: 24, approved: 9, status: "Gerando", statusClass: "warning" as const, updated: "2 min" },
];

export const previewWorkspace = {
  name: "Cenbrap em Dobro — Teste",
  status: "Piloto",
  statusClass: "warning" as const,
  meta: "Campanha ativa desde 18/05/2026 · Cliente Cenbrap · 12 derivações em revisão",
  currentStage: 1,
  stages: ["Briefing", "Produzir", "Revisar", "Entregar"] as const,
  briefingSliders: [
    { label: "Idade do público", value: 78 },
    { label: "Chance de oferta", value: 80 },
    { label: "Legibilidade", value: 85 },
    { label: "Urgência", value: 62 },
    { label: "Proximidade", value: 54 },
  ],
  briefingRules: [
    "CTA principal no quadrante superior direito, sempre acima da dobra.",
    'Evitar fundos escuros em combinações com selo "Cenbrap".',
    "Linha de oferta limitada a 7 palavras; sem caixa alta inteira.",
    'Selo "Garantia Cenbrap" presente em todas as peças.',
  ],
  derivations: [
    { art: "EM DOBRO", title: "Dobra Verão · 9:16", variations: "2 variações", version: "v3", score: 92, status: "Pronto", statusClass: "success" as const, gradient: V6_SURFACE_GRADIENTS[0] },
    { art: "SELO 2X", title: "Carrossel · 4 slides", variations: "1 variação", version: "v2", score: 88, status: "Revisão", statusClass: "warning" as const, gradient: V6_SURFACE_GRADIENTS[1] },
    { art: "GARANTIA", title: "Story · 9:16 vertical", variations: "3 variações", version: "v1", score: 71, status: "Rascunho", statusClass: "info" as const, gradient: V6_SURFACE_GRADIENTS[2] },
    { art: "PROMO", title: "Feed quadrado · 1:1", variations: "4 variações", version: "v2", score: 85, status: "Pronto", statusClass: "success" as const, gradient: V6_SURFACE_GRADIENTS[3] },
  ],
};

export const previewLibraryAssets = [
  { glyph: "HERO", name: "Hero Cenbrap v2", tags: ["Hero", "Curso"], size: "1080×1080", weight: "245 KB", gradient: V6_SURFACE_GRADIENTS[0] },
  { glyph: "LOGO", name: "Logo Cenbrap", tags: ["Logo"], size: "800×200", weight: "18 KB", gradient: V6_SURFACE_GRADIENTS[1] },
  { glyph: "PAT-01", name: "Background pattern 01", tags: ["Background", "Pattern"], size: "1920×1080", weight: "1.2 MB", gradient: V6_SURFACE_GRADIENTS[2] },
  { glyph: "TEST", name: "Card testimonial João", tags: ["Testimonial"], size: "600×600", weight: "89 KB", gradient: V6_SURFACE_GRADIENTS[3] },
  { glyph: "PROMO", name: "Banner promo Q3", tags: ["Banner", "Promo"], size: "1200×628", weight: "156 KB", gradient: V6_SURFACE_GRADIENTS[4] },
  { glyph: "LOGO", name: "Logo NR1", tags: ["Logo"], size: "800×200", weight: "22 KB", gradient: V6_SURFACE_GRADIENTS[5] },
  { glyph: "PROD", name: "Product shot Cenbrap", tags: ["Product"], size: "1080×1080", weight: "312 KB", gradient: V6_SURFACE_GRADIENTS[0] },
  { glyph: "PAT-02", name: "Background pattern 02", tags: ["Background"], size: "1920×1080", weight: "980 KB", gradient: V6_SURFACE_GRADIENTS[1] },
];

export const previewSettingsCards = [
  { title: "Equipe", description: "Convide membros, gerencie papéis e permissões de acesso ao workspace.", badge: "Implementado", badgeClass: "success" as const, enabled: true },
  { title: "Brand Kit", description: "Logos, paletas, tipografia e regras de voz que o laboratório usa como guia.", badge: "Implementado", badgeClass: "success" as const, enabled: true },
  { title: "Perfil", description: "Seu nome, foto e dados pessoais visíveis para o time.", badge: "Fora do laboratório", badgeClass: "neutral" as const, enabled: false },
  { title: "Workspace", description: "Nome, domínio e identidade visual do workspace compartilhado.", badge: "Fora do laboratório", badgeClass: "neutral" as const, enabled: false },
  { title: "Faturamento", description: "Plano atual, método de pagamento e histórico de cobranças via Stripe.", badge: "Captura pendente", badgeClass: "warning" as const, enabled: false },
  { title: "Planos", description: "Starter / Growth / Scale — compare benefícios e faça upgrade.", badge: "Captura pendente", badgeClass: "warning" as const, enabled: false },
] as const;

export type PreviewChatRole = "user" | "assistant" | "action_card" | "error";

export const previewChatThreads = [
  { id: "1", client: "Cenbrap", title: "Verão 2024 — Natura", active: true },
  { id: "2", client: "Cenbrap", title: "Black Friday — Far.me", active: false },
  { id: "3", client: "DoBem", title: "Lançamento Verão", active: false },
] as const;

export const previewChatContext = {
  campaign: "Verão 2024 — Natura",
  objective: "Awareness de lançamento",
  audience: "Mulheres 25-40, skincare natural",
  tone: "Inspirador e natural",
  platforms: "Instagram, Facebook",
  credits: 142,
} as const;

export const previewChatMessagesFull = [
  {
    id: "m1",
    role: "assistant" as const,
    content:
      "Olá! Vou te ajudar a montar o briefing da campanha **Verão 2024 — Natura**. Qual é o objetivo principal — awareness, conversão ou retenção?",
  },
  {
    id: "m2",
    role: "user" as const,
    content: "Awareness de lançamento. Público mulheres 25-40, tom inspirador e natural.",
  },
  {
    id: "m3",
    role: "assistant" as const,
    content:
      "Perfeito. Resumi o briefing abaixo. Quando estiver ok, posso gerar um piloto com 3 variações em 9:16.",
  },
  {
    id: "m4",
    role: "action_card" as const,
    content: "Gerar piloto — 3 variações 9:16",
    payload: {
      title: "Gerar piloto",
      description: "3 variações em formato 9:16 com base no briefing aprovado.",
      credits: 24,
      status: "pending",
      risk: "low",
    },
  },
  {
    id: "m5",
    role: "assistant" as const,
    content: "Enquanto isso, quer ajustar tom, CTA ou plataformas antes de confirmar?",
  },
] as const;

export const previewChatMessagesShort = previewChatMessagesFull.slice(0, 3);

export const previewOnboardingSteps = [
  {
    step: 1,
    title: "Conecte seu workspace",
    description: "Importe logos e paleta do Brand Kit para o ADScale entender sua marca.",
    cta: "Configurar Brand Kit",
  },
  {
    step: 2,
    title: "Crie sua primeira campanha",
    description: "Use o modo Chat ou o fluxo clássico — briefing guiado em minutos.",
    cta: "Nova campanha",
  },
  {
    step: 3,
    title: "Aprove o piloto",
    description: "Revise variações, ajuste com feedback e libere o lote completo.",
    cta: "Ver exemplo",
  },
] as const;

export const previewErrorState = {
  title: "Não foi possível gerar as variações",
  message:
    "O serviço de geração retornou um erro temporário. Seus créditos não foram debitados.",
  code: "GEN_TIMEOUT_504",
  retryLabel: "Tentar novamente",
  supportLabel: "Reportar problema",
} as const;

export const mockupIndex = [
  { slug: "topbar-promo", name: "08 — TopBar com toggle + hero Chat", file: "08-chat-promo-dashboard.html" },
  { slug: "dashboard", name: "01 — Dashboard", file: "01-dashboard.html" },
  { slug: "campaigns", name: "02 — Campanhas", file: "02-campaigns.html" },
  { slug: "campaign-workspace", name: "03 — Workspace", file: "03-campaign-workspace.html" },
  { slug: "library", name: "04 — Biblioteca", file: "04-library.html" },
  { slug: "settings", name: "05 — Configurações", file: "05-settings.html" },
  { slug: "chat-full", name: "06 — Chat modo completo", file: "06-chat-mode-full.html" },
  { slug: "chat-drawer", name: "07 — Chat drawer", file: "07-chat-mode-drawer.html" },
  { slug: "library-empty", name: "09 — Biblioteca vazia", file: "09-library-empty-state.html" },
  { slug: "chat-thread-curta", name: "10 — Chat thread curta", file: "10-chat-thread-curta.html" },
  { slug: "error-state", name: "11 — Error state", file: "11-error-state.html" },
  { slug: "onboarding", name: "12 — Onboarding first use", file: "12-onboarding-first-use.html" },
  { slug: "assistant-empty", name: "13 — Assistant empty state", file: "13-assistant-empty-state.html" },
  { slug: "login", name: "14 — Login / Acesso", file: "14-login.html" },
] as const;
