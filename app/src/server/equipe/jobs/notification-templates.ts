// Notification template catalog (#549): first-class PT-BR copy per
// `notification.requested` template key, plus the `notifications.type`
// mapping. Unknown keys fall back to generic copy and are logged by the
// delivery module — never dropped silently.

/** In-app `notifications.type` prefix. The column holds 32 chars. */
export const EQUIPE_NOTIFICATION_TYPE_PREFIX = "eq_";
export const EQUIPE_NOTIFICATION_TYPE_MAX = 32;

export function notificationTypeFor(templateKey: string): string {
  return `${EQUIPE_NOTIFICATION_TYPE_PREFIX}${templateKey.replaceAll(".", "_")}`;
}

type Template = { title: string; message: string };

const TEMPLATES: Record<string, Template> = {
  // Free diagnosis (ticket 08): delivered in-app and by e-mail through the same outbox.
  "diagnosis.ready": {
    title: "Seu diagnóstico está pronto",
    message: "O diagnóstico da sua marca ficou pronto. Abra a conversa para ver as oportunidades e o documento na Biblioteca.",
  },
  "diagnosis.insufficient": {
    title: "Seu diagnóstico precisa de mais conteúdo",
    message: "Li o que está público da sua marca, mas não deu para apontar oportunidades com fonte. Abra a conversa para acrescentar ou corrigir o site ou o @.",
  },
  "account.opened": {
    title: "Sua operação começou",
    message: "A conta da sua empresa foi criada. O Estrategista IA já está com o roteiro da implantação.",
  },
  "calibration.entered": {
    title: "Conta em calibração",
    message: "A implantação terminou e a conta entrou em calibração: as primeiras entregas reais estão a caminho.",
  },
  "account.activated": {
    title: "Sua operação está ativa",
    message: "A primeira frente foi liberada. A revisão de rotina agora é feita pela IA.",
  },
  "implantation.paused": {
    title: "Implantação pausada",
    message: "Ficamos 10 dias úteis sem avanço e pausamos a implantação. Veja o que falta para retomar.",
  },
  "implantation.resumed": {
    title: "Implantação retomada",
    message: "A pendência foi resolvida e a implantação voltou a andar.",
  },
  "implantation.reminder_day2": {
    title: "Falta pouco na implantação",
    message: "Há 2 dias úteis sem avanço na implantação. Veja o que está pendente.",
  },
  "implantation.reminder_day5": {
    title: "Implantação parada há 5 dias",
    message: "Há 5 dias úteis sem avanço. Quer que eu simplifique o que falta ou marcamos uma chamada?",
  },
  "scope.confirmed": { title: "Escopo confirmado", message: "O cliente confirmou o escopo." },
  "material.registered": { title: "Material recebido", message: "O cliente enviou um material." },
  "context_section.proposed": {
    title: "Contexto proposto",
    message: "Uma seção do Contexto de marketing foi proposta.",
  },
  "context_section.approved": {
    title: "Seção aprovada",
    message: "Uma seção do Contexto foi aprovada.",
  },
  "context.conflict_answered": {
    title: "Conflito respondido",
    message: "O cliente respondeu a um conflito de fato.",
  },
  "plan.proposed": { title: "Plano proposto", message: "O plano do ciclo foi proposto." },
  "plan.approved": { title: "Plano aprovado", message: "O cliente aprovou o plano." },
  "mandate.proposed": { title: "Mandato proposto", message: "Um mandato foi proposto." },
  "mandate.approved": { title: "Mandato aprovado", message: "O cliente aprovou um mandato." },
  "brand.voice_approved": { title: "Voz aprovada", message: "O cliente aprovou a voz da marca." },
  "connection.manual_mode_agreed": {
    title: "Modo manual combinado",
    message: "O cliente combinou a publicação manual por escrito.",
  },
  "connection.connected": {
    title: "Conexão verificada",
    message: "Uma conta foi conectada e verificada.",
  },
  "billing.installment_paid": {
    title: "Parcela registrada",
    message: "Uma parcela da implantação foi registrada como paga.",
  },
  "onboarding.step_advanced": {
    title: "Etapa concluída",
    message: "Uma etapa da implantação foi concluída.",
  },
  "batch.delivered": {
    title: "Lote pronto para aprovar",
    message: "Um novo lote chegou para a sua decisão.",
  },
  "batch.approved": {
    title: "Lote aprovado",
    message: "O lote foi aprovado e os itens seguem para publicação.",
  },
  "batch.reminder_24h": {
    title: "Lote aguardando aprovação",
    message: "Faltam 24 horas para o prazo do lote. Revise os itens pendentes.",
  },
  "batch.reminder_item_4h": {
    title: "Item perto do limite",
    message: "Um item pendente chega ao limite em 4 horas. Decida para não perder a janela.",
  },
  "item.approved": {
    title: "Item aprovado",
    message: "O item foi aprovado e entrou na fila de publicação.",
  },
  "item.adjustment_requested": {
    title: "Ajuste pedido",
    message: "Um ajuste foi pedido para o item.",
  },
  "caption.edited": {
    title: "Legenda editada",
    message: "A legenda do item foi editada e está em revalidação.",
  },
  "business_fact.confirmed": {
    title: "Fato confirmado",
    message: "Um fato do negócio foi confirmado e entrou no Contexto.",
  },
  "item.declined": {
    title: "Item descartado",
    message: "O item saiu do calendário e não será publicado.",
  },
  "item.cancelled": {
    title: "Agendamento cancelado",
    message: "O agendamento do item foi cancelado.",
  },
  "piece.chosen": { title: "Peça escolhida", message: "A peça do ângulo foi escolhida." },
  "item.window_missed": {
    title: "Janela perdida",
    message: "O item passou do limite sem decisão e não foi publicado. Um novo horário será proposto.",
  },
  "item.rescheduled": {
    title: "Novo horário proposto",
    message: "O item ganhou um novo horário e voltou para decisão.",
  },
  "item.held": {
    title: "Item segurado",
    message: "O item foi segurado e aguarda liberação para seguir.",
  },
  "item.verifying": {
    title: "Confirmando publicação",
    message: "Estamos confirmando a publicação com o Instagram.",
  },
  "item.failed": {
    title: "Publicação falhou",
    message: "A publicação do item falhou. Veja o motivo e o próximo passo.",
  },
  "item.published": { title: "Item publicado", message: "O item foi publicado." },
  "manual.declared": {
    title: "Publicação declarada",
    message: "A publicação manual foi declarada pelo cliente.",
  },
  "manual.confirmed": {
    title: "Publicação confirmada",
    message: "A publicação manual foi confirmada no Instagram.",
  },
  "post.removed": { title: "Post removido", message: "O post foi removido." },
  "round.opened": {
    title: "Rodada aberta",
    message: "Uma rodada de calibração foi aberta.",
  },
  "round.correction_submitted": {
    title: "Correção enviada",
    message: "Uma versão corrigida foi enviada para a qualidade.",
  },
  "round.critical_failure": {
    title: "Falha crítica",
    message: "Uma falha crítica foi marcada na calibração.",
  },
  "round.item_withdrawn": {
    title: "Item retirado",
    message: "Um item foi retirado da rodada.",
  },
  "round.closed": {
    title: "Rodada fechada",
    message: "Uma rodada de calibração foi fechada.",
  },
  "front.released": {
    title: "Frente liberada",
    message: "Uma frente foi liberada pela qualidade.",
  },
  "front.scope_decision_opened": {
    title: "Decisão de escopo",
    message: "Uma frente chegou ao limite da calibração e precisa de decisão.",
  },
  "front.scope_decision_resolved": {
    title: "Escopo decidido",
    message: "A decisão de escopo de uma frente foi registrada.",
  },
  "front.recalibration_opened": {
    title: "Recalibração aberta",
    message: "Uma frente voltou para calibração.",
  },
  "escalation.opened": {
    title: "Escalonamento aberto",
    message: "Um escalonamento foi aberto e precisa de responsável.",
  },
  "escalation.merged": {
    title: "Escalonamentos unidos",
    message: "Dois escalonamentos do mesmo item foram unidos.",
  },
  "escalation.part_resolved": {
    title: "Parte resolvida",
    message: "Uma parte do escalonamento foi resolvida.",
  },
  "escalation.client_question": {
    title: "Pergunta da equipe",
    message: "A equipe precisa de uma resposta sua para seguir.",
  },
  "escalation.client_reminder": {
    title: "Resposta pendente",
    message: "A equipe ainda aguarda sua resposta. O prazo está chegando.",
  },
  "escalation.closed": {
    title: "Escalonamento fechado",
    message: "Um escalonamento foi fechado.",
  },
  "escalation.sla_breached": {
    title: "Prazo estourado",
    message: "Um escalonamento passou do prazo sem solução.",
  },
  "exception.opened": {
    title: "Exceção aberta",
    message: "Uma exceção de atendimento foi aberta.",
  },
  "exception.assumed": {
    title: "Uma pessoa entrou na conversa",
    message: "Uma pessoa da nossa equipe assumiu o atendimento.",
  },
  "exception.closed": {
    title: "Exceção fechada",
    message: "A exceção de atendimento foi fechada e a conta voltou para a IA.",
  },
  "exception.sla_breached": {
    title: "Prazo estourado",
    message: "Uma exceção de atendimento passou do prazo de resposta.",
  },
  "pause.applied": { title: "Pausa aplicada", message: "Uma pausa foi aplicada." },
  "pause.lifted": { title: "Pausa retirada", message: "Uma pausa foi retirada." },
  // #583 — parada global de publicações sem deploy.
  "global_stop.applied": {
    title: "Publicações paradas em todas as contas",
    message: "A operação parou todas as publicações. Os itens agendados estão segurados.",
  },
  "global_stop.lifted": {
    title: "Publicações retomadas",
    message: "A operação retomou as publicações. Os itens segurados estão em revalidação.",
  },
  "quality.hours_warning": {
    title: "Qualidade acima de 6 h",
    message: "Uma frente passou de 6 horas de qualidade.",
  },
  "quality.hours_over_budget": {
    title: "Qualidade acima de 8 h",
    message: "Uma frente passou de 8 horas de qualidade. Decida se segue ou abre a decisão de escopo.",
  },
};

const FALLBACK_TEMPLATE: Template = {
  title: "Atualização da Equipe",
  message: "Há uma atualização na sua operação. Abra o app para ver.",
};

/** Every template key with first-class copy (unknown keys fall back). */
export function knownTemplateKeys(): string[] {
  return Object.keys(TEMPLATES);
}

export function templateFor(templateKey: string): { template: Template; known: boolean } {
  const template = TEMPLATES[templateKey];
  if (!template) return { template: FALLBACK_TEMPLATE, known: false };
  return { template, known: true };
}
