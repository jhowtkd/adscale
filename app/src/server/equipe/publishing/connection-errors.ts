// Plain-language (pt-BR) Instagram connection errors (#548). Every failure
// the client can see — OAuth, expired/revoked token, send refusal — maps to
// one sentence naming the custodian when one is known. Shared by the module
// commands and the OAuth routes so both speak the same words.

export type InstagramFailureCode =
  | "connection_expired"
  | "connection_revoked"
  | "connection_error"
  | "connection_missing"
  | "no_instagram_account"
  | "oauth_denied"
  | "oauth_failed"
  | "app_not_configured"
  | "publish_refused";

/** Machine codes the connection row stores as `error` (never active). */
export const CONNECTION_ERROR_CODES: readonly string[] = [
  "connection_expired",
  "connection_revoked",
  "connection_error",
  "no_instagram_account",
  "oauth_failed",
];

export function instagramFailureMessage(
  code: string,
  custodianName: string | null,
): string {
  const who = custodianName ?? "a pessoa custodiante";
  switch (code) {
    case "connection_expired":
      return (
        `A conexão do Instagram expirou: ${who}, custodiante, precisa reconectar ` +
        `a conta para as publicações continuarem.`
      )
    case "connection_revoked":
      return (
        `A conexão do Instagram foi revogada: ${who}, custodiante, precisa conectar ` +
        `a conta de novo para as publicações continuarem.`
      )
    case "no_instagram_account":
      return (
        "Não encontramos uma conta profissional do Instagram ligada ao seu Facebook. " +
        "Converta a conta para profissional e tente de novo — o passo a passo está na conversa."
      )
    case "oauth_denied":
      return (
        "Você negou o acesso ao Instagram. Sem a conexão, a publicação continua manual; " +
        "é só conectar de novo quando quiser."
      )
    case "oauth_failed":
      return (
        "Não conseguimos concluir a conexão com o Instagram. Tente de novo; " +
        "se falhar outra vez, nossa equipe entra em contato."
      )
    case "app_not_configured":
      return "A conexão do Instagram ainda não está configurada. Fale com nossa equipe.";
    case "publish_refused":
      return "O Instagram recusou a publicação. Nossa equipe já foi avisada e vai propor um novo horário.";
    case "connection_missing":
      return (
        `O Instagram ainda não está conectado: ${who}, custodiante, precisa conectar ` +
        `a conta para as publicações saírem.`
      );
    case "connection_error":
    default:
      return (
        "Não conseguimos falar com o Instagram agora. Tentaremos de novo; " +
        "se continuar falhando, nossa equipe entra em contato."
      )
  }
}
