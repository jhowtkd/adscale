/**
 * The fixed lines the conversation answers with when the free AI credit is over (ticket 13: D-12 and the screen review, T7 and T8). Never generated: each one
 * is stored ONCE, in pt-BR, with its key in the message payload (`fixedReply`), and the screen shows the reader's language, like the opening line. The server
 * streams the same line in the language of the request, so what is read live and what is read later agree.
 */
export type FixedReply = "free_budget_exhausted" | "diagnosis_budget_exceeded" | "plan_later";

export const FIXED_REPLIES = {
  "pt-BR": {
    // The free conversation is over, and the diagnosis exists.
    free_budget_exhausted: "Sua conversa grátis com a IA chegou ao limite. O diagnóstico e a Biblioteca continuam disponíveis; para conhecer o plano, é só dizer “quero assinar”.",
    // The credit ended before the diagnosis could be built: it cannot say that the diagnosis is available.
    diagnosis_budget_exceeded: "O crédito grátis de IA da sua conta acabou, então não consegui montar o diagnóstico. Sua conta e sua Biblioteca continuam disponíveis; para falar sobre o plano, é só dizer “quero assinar”.",
    // "Agora não" on the plan card of a conversation that cannot go on: it is not an invitation to carry on for free.
    plan_later: "Tudo bem. Quando quiser, é só dizer “quero assinar”.",
  },
  en: {
    free_budget_exhausted: "Your free AI conversation has reached its limit. Your diagnosis and Library are still available; to learn about the plan, just say “I want to subscribe”.",
    diagnosis_budget_exceeded: "The free AI credit on your account ran out, so I could not build the diagnosis. Your account and Library are still available; to talk about the plan, just say “I want to subscribe”.",
    plan_later: "That's fine. Whenever you want, just say “I want to subscribe”.",
  },
} as const satisfies Record<"pt-BR" | "en", Record<FixedReply, string>>;

const language = (locale: string) => (locale.startsWith("en") ? "en" : "pt-BR") as keyof typeof FIXED_REPLIES;

/** The line in the reader's language (pt-BR when the language is unknown). */
export function fixedReplyText(key: FixedReply, locale = "pt-BR"): string {
  return FIXED_REPLIES[language(locale)][key];
}

/** The key a stored message carries, when it is one of these lines. */
export function fixedReplyOf(payload: unknown): FixedReply | null {
  const key = payload && typeof payload === "object" ? (payload as { fixedReply?: unknown }).fixedReply : undefined;
  return typeof key === "string" && Object.hasOwn(FIXED_REPLIES["pt-BR"], key) ? key as FixedReply : null;
}

/** What "Agora não" sends from the plan card of a conversation that cannot go on, in the reader's language. */
const PLAN_LATER_MESSAGES = { "pt-BR": "Agora não", en: "Not now" } as const;
export const planLaterMessage = (locale = "pt-BR") => PLAN_LATER_MESSAGES[language(locale)];

const normalized = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s.!?]+$/g, "").trim().toLowerCase();
/** The phrase of that button, whichever language it was sent in: the server answers it with the fixed line, never a model. */
export const isPlanLaterPhrase = (text: string) => Object.values(PLAN_LATER_MESSAGES).some(phrase => normalized(phrase) === normalized(text));
