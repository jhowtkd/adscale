/**
 * Eventos de conversão do relatório Anúncios veiculados (ICE-01B, spec #383).
 * Rótulos compreensíveis para tipos de ação observados; o evento é sempre
 * escolhido/configurado no escopo do relatório, nunca adivinhado pelo texto
 * da campanha. Tipos fora do catálogo ecoam o tipo cru com `known: false` —
 * rótulo é exibição, nunca presunção de alias ou equivalência.
 */

export interface KnownConversionEvent {
  actionType: string;
  ptBR: string;
  en: string;
}

/** Catálogo de exibição; cada tipo é um evento distinto, sem alias implícito. */
export const KNOWN_CONVERSION_EVENTS: KnownConversionEvent[] = [
  { actionType: "purchase", ptBR: "Compra", en: "Purchase" },
  { actionType: "lead", ptBR: "Lead", en: "Lead" },
  { actionType: "complete_registration", ptBR: "Cadastro concluído", en: "Completed registration" },
  { actionType: "add_to_cart", ptBR: "Adição ao carrinho", en: "Add to cart" },
  { actionType: "initiate_checkout", ptBR: "Início de checkout", en: "Checkout initiated" },
  { actionType: "add_payment_info", ptBR: "Dados de pagamento", en: "Payment info added" },
  { actionType: "view_content", ptBR: "Visualização de conteúdo", en: "Content view" },
  { actionType: "search", ptBR: "Busca", en: "Search" },
  { actionType: "contact", ptBR: "Contato", en: "Contact" },
  { actionType: "schedule", ptBR: "Agendamento", en: "Schedule" },
  { actionType: "submit_application", ptBR: "Envio de candidatura", en: "Application submitted" },
  { actionType: "donate", ptBR: "Doação", en: "Donate" },
  { actionType: "subscribe", ptBR: "Assinatura", en: "Subscribe" },
  { actionType: "start_trial", ptBR: "Início de teste", en: "Trial started" },
  { actionType: "tutorial_completion", ptBR: "Tutorial concluído", en: "Tutorial completed" },
];

const LABELS_BY_TYPE = new Map(KNOWN_CONVERSION_EVENTS.map((entry) => [entry.actionType, entry]));

export interface ConversionEventOption {
  actionType: string;
  label: string;
  known: boolean;
}

/** Normaliza o parâmetro `event` da URL: vazio/ausente = evento não escolhido. */
export function normalizeEventParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function describeEvent(actionType: string, locale?: string): ConversionEventOption {
  const known = LABELS_BY_TYPE.get(actionType);
  if (!known) return { actionType, label: actionType, known: false };
  return {
    actionType,
    label: locale === "pt-BR" ? known.ptBR : known.en,
    known: true,
  };
}

/**
 * Eventos disponíveis no escopo: união ordenada dos tipos observados nos
 * mapas de ação das linhas-fonte. Escopo sem mapa não oferece eventos.
 */
export function listAvailableEvents(
  actionMaps: Array<Record<string, number> | null | undefined>,
  locale?: string
): ConversionEventOption[] {
  const seen = new Set<string>();
  for (const map of actionMaps) {
    if (!map) continue;
    for (const actionType of Object.keys(map)) seen.add(actionType);
  }
  return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((type) => describeEvent(type, locale));
}
