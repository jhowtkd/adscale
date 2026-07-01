export const USD_BRL_PLANNING_RATE = 5.5;

const PRICE = {
  planInputPerMillion: 0.75,
  planOutputPerMillion: 4.5,
  imageTextInputPerMillion: 5,
  imageInputPerMillion: 8,
  imageOutputPerMillion: 30,
};

export const pricingAssumptions = {
  campaignsPerMonth: 80,
  imagesPerCampaign: 6,
  planInputTokens: 3000,
  planOutputTokens: 1200,
  imageTextTokens: 900,
  referenceImageTokens: 3200,
  generatedImageTokens: 8000,
};

export const planTiers = [
  {
    key: "trial" as const,
    name: "Trial",
    priceBrl: 0,
    credits: 30,
    campaigns: 1,
    images: 6,
    period: "único",
    badge: "Teste",
    description: "Para experimentar a ferramenta com uma campanha real.",
    features: ["1 campanha de teste", "6 imagens totais", "Restilização liberada", "Sem renovação automática"],
    trial: true,
  },
  {
    key: "starter" as const,
    name: "Starter",
    priceBrl: 47,
    credits: 30,
    campaigns: 1,
    images: 6,
    period: "mês",
    badge: "Entrada",
    description: "Para freelancers e pequenos testes mensais.",
    features: ["1 campanha por mês", "6 imagens por mês", "Histórico e galeria", "Exportação manual"],
  },
  {
    key: "growth" as const,
    name: "Growth",
    priceBrl: 147,
    credits: 120,
    campaigns: 4,
    images: 24,
    period: "mês",
    badge: "Recomendado",
    description: "Para quem roda campanhas recorrentes.",
    features: ["4 campanhas por mês", "24 imagens por mês", "Restilização inclusa", "Equipe básica"],
    recommended: true,
  },
  {
    key: "scale" as const,
    name: "Scale",
    priceBrl: 397,
    credits: 360,
    campaigns: 12,
    images: 72,
    period: "mês",
    badge: "Volume",
    description: "Para times que precisam de volume controlado.",
    features: ["12 campanhas por mês", "72 imagens por mês", "Equipe e permissões", "Prioridade de fila"],
  },
];

export const brlCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

export const usdCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function costPerMillion(tokens: number, price: number) {
  return (tokens / 1_000_000) * price;
}

function toBrl(usd: number) {
  return usd * USD_BRL_PLANNING_RATE;
}

export function calculateForecast(input = pricingAssumptions) {
  const planCost =
    costPerMillion(input.planInputTokens, PRICE.planInputPerMillion) +
    costPerMillion(input.planOutputTokens, PRICE.planOutputPerMillion);
  const imageCost =
    costPerMillion(input.imageTextTokens, PRICE.imageTextInputPerMillion) +
    costPerMillion(input.referenceImageTokens, PRICE.imageInputPerMillion) +
    costPerMillion(input.generatedImageTokens, PRICE.imageOutputPerMillion);
  const campaignCost = planCost + imageCost * input.imagesPerCampaign;
  const monthlyCost = campaignCost * input.campaignsPerMonth;

  return {
    planCost,
    imageCost,
    campaignCost,
    monthlyCost,
    cushion: monthlyCost * 1.25,
    campaignCostBrl: toBrl(campaignCost),
    monthlyCostBrl: toBrl(monthlyCost),
    cushionBrl: toBrl(monthlyCost * 1.25),
    imageCostBrl: toBrl(imageCost),
    protectedCampaignCostBrl: toBrl(campaignCost) * 1.25,
  };
}
