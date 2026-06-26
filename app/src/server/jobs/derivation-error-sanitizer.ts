export const DERIVATION_USER_SAFE_ERROR =
  "Não foi possível gerar esta variação. Verifique configuração do cliente e tente novamente.";

const TECHNICAL_ERROR_PATTERN =
  /\b(sql|relation|column|postgres|drizzle|constraint|syntax error|does not exist)\b/i;

export function sanitizeDerivationFailureError(error: unknown): {
  userMessage: string;
  technicalDetail: string;
} {
  const technicalDetail =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (TECHNICAL_ERROR_PATTERN.test(technicalDetail)) {
    return {
      userMessage: DERIVATION_USER_SAFE_ERROR,
      technicalDetail,
    };
  }

  return {
    userMessage: DERIVATION_USER_SAFE_ERROR,
    technicalDetail,
  };
}
