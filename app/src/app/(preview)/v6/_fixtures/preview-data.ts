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

export const mockupIndex = [
  { slug: "topbar-promo", name: "08 — TopBar com toggle + hero Chat", file: "08-chat-promo-dashboard.html" },
  { slug: "dashboard", name: "01 — Dashboard", file: "01-dashboard.html" },
  { slug: "campaigns", name: "02 — Campanhas", file: "02-campaigns.html" },
  { slug: "campaign-workspace", name: "03 — Workspace", file: "03-campaign-workspace.html", status: "planejado" },
  { slug: "library", name: "04 — Biblioteca", file: "04-library.html", status: "planejado" },
  { slug: "settings", name: "05 — Configurações", file: "05-settings.html", status: "planejado" },
  { slug: "chat-full", name: "06 — Chat modo completo", file: "06-chat-mode-full.html", status: "planejado" },
  { slug: "chat-drawer", name: "07 — Chat drawer", file: "07-chat-mode-drawer.html", status: "planejado" },
  { slug: "library-empty", name: "09 — Biblioteca vazia", file: "09-library-empty-state.html", status: "planejado" },
  { slug: "chat-thread-curta", name: "10 — Chat thread curta", file: "10-chat-thread-curta.html", status: "planejado" },
  { slug: "error-state", name: "11 — Error state", file: "11-error-state.html", status: "planejado" },
  { slug: "onboarding", name: "12 — Onboarding first use", file: "12-onboarding-first-use.html", status: "planejado" },
  { slug: "assistant-empty", name: "13 — Assistant empty state", file: "13-assistant-empty-state.html", status: "planejado" },
] as const;
