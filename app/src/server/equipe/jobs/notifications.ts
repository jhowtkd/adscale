// Notification outbox delivery (#549): templates, recipients, senders.
//
// Commands record `notification.requested` events in their own transaction;
// the `equipe-notifications` job delivers them AFTER commit, so a send
// failure never undoes the command. Delivery is at-least-once but
// idempotent per event: the delivery record (migration 0123) tells re-runs
// which channels already went out.
//
// Channels per event:
// - client/staff recipients → in-app row in `notifications` (new `eq_*`
//   types) + email via Resend, honoring `emailNotificationsEnabled` and
//   `emailVerified`;
// - `strategist` → `internal` no-op (the agent loop reads the events
//   directly; nothing to send);
// - unknown role, malformed payload or zero reachable recipients → recorded
//   `skipped`, never retried forever.

import { z } from "zod";
import { eq } from "drizzle-orm";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { createNotification } from "@/server/repositories/notification";
import { sendEmail } from "@/server/services/email";
import { escapeHtml } from "@/server/services/email-template";
import type {
  AccountScope,
  EquipeRepositories,
  InternalEquipeRepositories,
} from "../data";
import { executeCommand } from "../module/commands";
import { listNotificationOutbox, type OutboxEntry } from "../module/jobs-delivery";
import {
  createProdJobDeps,
  listEnabledAccounts,
  moduleDepsFor,
  systemJobActor,
  type EquipeJobDeps,
  type JobStep,
} from "./shared";

export const EQUIPE_NOTIFICATIONS_ID = "equipe-notifications";
export const EQUIPE_NOTIFICATIONS_CRON = "*/5 * * * *";

/** In-app `notifications.type` prefix. The column holds 32 chars. */
export const EQUIPE_NOTIFICATION_TYPE_PREFIX = "eq_";
export const EQUIPE_NOTIFICATION_TYPE_MAX = 32;

export function notificationTypeFor(templateKey: string): string {
  return `${EQUIPE_NOTIFICATION_TYPE_PREFIX}${templateKey.replaceAll(".", "_")}`;
}

type Template = { title: string; message: string };

const TEMPLATES: Record<string, Template> = {
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

function templateFor(templateKey: string): { template: Template; known: boolean } {
  const template = TEMPLATES[templateKey];
  if (!template) return { template: FALLBACK_TEMPLATE, known: false };
  return { template, known: true };
}

const CLIENT_RECIPIENT_ROLES = new Set(["approver", "substitute", "custodian", "member"]);
const STAFF_RECIPIENT_ROLES = new Set(["quality", "operations", "support"]);
const INTERNAL_RECIPIENT_ROLE = "strategist";
const FOUNDER_RECIPIENT_ROLE = "founder";

export type NotificationRecipient = {
  userId: string | null;
  /** Bare contact email (client people without a login). */
  email: string | null;
};

/**
 * Resolve a recipient role to reachable contacts. Client roles read the
 * account people; staff roles read the global staff rows; `founder` fans
 * out to every active staffer — in the pilot the founder holds every
 * internal role, and user-level dedupe keeps it to one row/email each.
 */
export type NotificationRecipientStores = {
  repos: EquipeRepositories;
  internal: InternalEquipeRepositories;
};

export async function resolveNotificationRecipients(
  stores: NotificationRecipientStores,
  scope: AccountScope,
  recipientRole: string,
): Promise<NotificationRecipient[] | { internal: true } | { unknown: true }> {
  if (recipientRole === INTERNAL_RECIPIENT_ROLE) return { internal: true };
  if (CLIENT_RECIPIENT_ROLES.has(recipientRole)) {
    const people = await stores.repos.people.list(scope);
    return people
      .filter((person) => person.active && person.role === recipientRole)
      .map((person) => ({ userId: person.userId, email: person.email }));
  }
  if (STAFF_RECIPIENT_ROLES.has(recipientRole)) {
    const staff = await stores.internal.staff.list({ active: true });
    return staff
      .filter((row) => row.role === recipientRole)
      .map((row) => ({ userId: row.userId, email: null }));
  }
  if (recipientRole === FOUNDER_RECIPIENT_ROLE) {
    const staff = await stores.internal.staff.list({ active: true });
    const seen = new Set<string>();
    const out: NotificationRecipient[] = [];
    for (const row of staff) {
      if (!row.userId || seen.has(row.userId)) continue;
      seen.add(row.userId);
      out.push({ userId: row.userId, email: null });
    }
    return out;
  }
  return { unknown: true };
}

export type NotificationUser = {
  email: string;
  emailVerified: boolean;
  emailNotificationsEnabled: boolean;
};

export type NotificationDeliveryAdapters = {
  users: {
    get(userId: string): Promise<NotificationUser | null>;
  };
  inbox: {
    insert(input: {
      userId: string;
      workspaceId: string;
      type: string;
      title: string;
      message: string;
    }): Promise<void>;
  };
  mailer: {
    send(input: { to: string; subject: string; title: string; body: string }): Promise<void>;
  };
};

function equipeEmailHtml(title: string, body: string): string {
  return (
    `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">` +
    `<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(title)}</h1>` +
    `<p style="font-size:15px;line-height:1.5;margin:0;">${escapeHtml(body)}</p>` +
    `</div>`
  );
}

export function createProdDeliveryAdapters(): NotificationDeliveryAdapters {
  return {
    users: {
      async get(userId) {
        const rows = await db
          .select({
            email: user.email,
            emailVerified: user.emailVerified,
            emailNotificationsEnabled: user.emailNotificationsEnabled,
          })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);
        return rows[0] ?? null;
      },
    },
    inbox: {
      async insert(input) {
        await createNotification({
          userId: input.userId,
          workspaceId: input.workspaceId,
          type: input.type,
          title: input.title,
          message: input.message,
        });
      },
    },
    mailer: {
      async send(input) {
        await sendEmail({
          to: input.to,
          subject: input.subject,
          text: input.body,
          html: equipeEmailHtml(input.title, input.body),
        });
      },
    },
  };
}

const requestedPayloadSchema = z.object({
  recipientRole: z.string().min(1),
  templateKey: z.string().min(1),
});

export type DeliverOutboxEntryInput = {
  stores: NotificationRecipientStores;
  adapters: NotificationDeliveryAdapters;
  scope: AccountScope;
  entry: OutboxEntry;
  /** Persist channels through the module command (never inline SQL). */
  record: (eventId: string, channels: string[]) => Promise<void>;
};

export type DeliverOutboxEntryResult = {
  eventId: string;
  channels: string[];
  delivered: boolean;
};

/**
 * Deliver one outbox entry: resolve recipients, send the missing channels,
 * record what went out. A channel failure records the channels that did
 * complete and rethrows, so the retry only delivers what is missing —
 * at-least-once per channel, never a silent loss.
 */
export async function deliverOutboxEntry(
  input: DeliverOutboxEntryInput,
): Promise<DeliverOutboxEntryResult> {
  const { stores, adapters, scope, entry } = input;
  const eventId = entry.event.id;
  const parsed = requestedPayloadSchema.safeParse(entry.event.payload);
  if (!parsed.success) {
    logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] malformed notification payload, skipping`, {
      eventId,
    });
    await input.record(eventId, ["skipped"]);
    return { eventId, channels: ["skipped"], delivered: false };
  }
  const { recipientRole, templateKey } = parsed.data;
  const { template, known } = templateFor(templateKey);
  if (!known) {
    logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] unknown template, using fallback`, {
      eventId,
      templateKey,
    });
  }
  const resolved = await resolveNotificationRecipients(stores, scope, recipientRole);
  if ("internal" in resolved) {
    const channels = [...new Set([...entry.deliveredChannels, "internal"])];
    await input.record(eventId, channels);
    return { eventId, channels, delivered: false };
  }
  if ("unknown" in resolved) {
    logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] unknown recipient role, skipping`, {
      eventId,
      recipientRole,
    });
    await input.record(eventId, ["skipped"]);
    return { eventId, channels: ["skipped"], delivered: false };
  }
  const userIds = [...new Set(resolved.map((r) => r.userId).filter((id): id is string => !!id))];
  const emails = await deliverableEmails(adapters, resolved);
  if (userIds.length === 0 && emails.length === 0) {
    await input.record(eventId, ["skipped"]);
    return { eventId, channels: ["skipped"], delivered: false };
  }
  const completed = [...entry.deliveredChannels];
  const missingInapp = userIds.length > 0 && !completed.includes("inapp");
  const missingEmail = emails.length > 0 && !completed.includes("email");
  if (!missingInapp && !missingEmail) {
    return { eventId, channels: completed, delivered: false };
  }
  const type = notificationTypeFor(templateKey);
  try {
    if (missingInapp) {
      for (const userId of userIds) {
        await adapters.inbox.insert({
          userId,
          workspaceId: scope.workspaceId,
          type,
          title: template.title,
          message: template.message,
        });
      }
      completed.push("inapp");
    }
    if (missingEmail) {
      for (const to of emails) {
        await adapters.mailer.send({
          to,
          subject: template.title,
          title: template.title,
          body: template.message,
        });
      }
      completed.push("email");
    }
  } catch (error) {
    // Partial progress is still recorded: the retry only delivers what is
    // missing instead of duplicating what went out.
    if (completed.length > entry.deliveredChannels.length) {
      await input.record(eventId, completed);
    }
    throw error;
  }
  await input.record(eventId, completed);
  return { eventId, channels: completed, delivered: true };
}

/**
 * Emails that may actually receive this notification: user-linked contacts
 * honor the existing preferences (verified + opted in); bare client
 * contact emails have no preference row and always receive.
 */
async function deliverableEmails(
  adapters: NotificationDeliveryAdapters,
  recipients: NotificationRecipient[],
): Promise<string[]> {
  const emails = new Set<string>();
  for (const recipient of recipients) {
    if (recipient.userId) {
      const account = await adapters.users.get(recipient.userId);
      if (account && account.emailVerified && account.emailNotificationsEnabled) {
        emails.add(account.email);
      } else if (!account && recipient.email) {
        emails.add(recipient.email);
      }
      continue;
    }
    if (recipient.email) emails.add(recipient.email);
  }
  return [...emails];
}

export type EquipeNotificationsResult = {
  accounts: number;
  delivered: string[];
  failed: Array<{ eventId: string; code: string; message: string }>;
};

export type NotificationsJobDeps = EquipeJobDeps & {
  delivery: NotificationDeliveryAdapters;
};

export function createNotificationsHandler(deps: NotificationsJobDeps) {
  return async function equipeNotificationsHandler({
    step,
  }: {
    event: { data: unknown };
    step: JobStep;
  }): Promise<EquipeNotificationsResult> {
    const accounts = await step.run("list-enabled-accounts", () => listEnabledAccounts(deps));
    const delivered: string[] = [];
    const failed: Array<{ eventId: string; code: string; message: string }> = [];
    for (const account of accounts) {
      const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
      const outbox = await listNotificationOutbox(deps.uow.repos, scope);
      for (const entry of outbox) {
        try {
          const outcome = await step.run(`deliver-${entry.event.id}`, () =>
            deliverOutboxEntry({
              stores: { repos: deps.uow.repos, internal: deps.uow.internal },
              adapters: deps.delivery,
              scope,
              entry,
              record: async (eventId, channels) => {
                const recorded = await executeCommand(
                  moduleDepsFor(deps, account.workspaceId),
                  { actor: systemJobActor(EQUIPE_NOTIFICATIONS_ID), ...scope },
                  { type: "record_notification_delivered", payload: { eventId, channels } },
                );
                if (!recorded.ok) {
                  throw new Error(`record failed: ${recorded.error.code} ${recorded.error.message}`);
                }
              },
            }),
          );
          if (outcome.delivered) delivered.push(entry.event.id);
        } catch (error) {
          logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] delivery failed`, {
            ...scope,
            eventId: entry.event.id,
            error: error instanceof Error ? error.message : "unknown",
          });
          failed.push({
            eventId: entry.event.id,
            code: "threw",
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    }
    return { accounts: accounts.length, delivered, failed };
  };
}

export function buildEquipeNotificationsJob(client: typeof inngest, deps: NotificationsJobDeps) {
  return client.createFunction(
    {
      id: EQUIPE_NOTIFICATIONS_ID,
      triggers: [{ cron: EQUIPE_NOTIFICATIONS_CRON }],
      // Delivery records make redelivery a no-op per event, so overlapping
      // runs only repeat quiet skips.
      concurrency: [{ limit: 1 }],
      onFailure: async ({ error }) => {
        logger.error(`[${EQUIPE_NOTIFICATIONS_ID}] failed`, {
          error: error instanceof Error ? error.message : "unknown",
        });
      },
    },
    createNotificationsHandler(deps),
  );
}

export function createProdNotificationsDeps(): NotificationsJobDeps {
  return { ...createProdJobDeps(), delivery: createProdDeliveryAdapters() };
}

export const equipeNotificationsJob = buildEquipeNotificationsJob(inngest, createProdNotificationsDeps());
