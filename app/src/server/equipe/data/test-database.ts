/**
 * Banco de teste das suítes pg da Equipe.
 *
 * Ordem de resolução:
 * 1. `TEST_DATABASE_URL`, quando definida (rodadas locais contra o container
 *    adscale-test-postgres em localhost:5433);
 * 2. senão, `DATABASE_URL`, quando definida E o nome do banco (pathname da
 *    URL) termina com `_test` (o CI usa
 *    postgres://test:test@localhost:5432/adscale_test, já migrado pelo passo
 *    "Run migrations", sem definir TEST_DATABASE_URL);
 * 3. senão, null — a suíte pula (skip).
 *
 * Propriedade de segurança: o retorno nunca aponta para um banco cujo nome
 * não termina com `_test`. Uma TEST_DATABASE_URL explícita fora desse padrão
 * também retorna null (nunca executa contra banco inseguro, nem cai para
 * DATABASE_URL por trás do chamado explícito).
 */
export function isTestDatabaseUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  const segments = pathname.split("/").filter(Boolean);
  const databaseName = segments[0] ?? "";
  return databaseName.endsWith("_test");
}

export function resolveEquipeTestDatabaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): string | null {
  const explicit = env.TEST_DATABASE_URL;
  if (explicit) {
    return isTestDatabaseUrl(explicit) ? explicit : null;
  }
  const fallback = env.DATABASE_URL;
  if (fallback && isTestDatabaseUrl(fallback)) {
    return fallback;
  }
  return null;
}
