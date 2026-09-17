import { parseResyncArgs } from "../src/server/served-ads/resync-plan";

/**
 * CLI de ressincronização de janelas autorizadas (ICE-01B).
 * Dry-run padrão, escopo explícito; --apply executa. Cada execução cria
 * um NOVO snapshot identificado por conta+janela — histórico preservado.
 */

const USAGE = `Uso:
  served-ads:resync --workspace <uuid> --windows 7,30 [--connection <uuid>] [--apply]

  --workspace    obrigatório: ressincroniza SOMENTE este workspace.
  --windows      obrigatório: subconjunto de 7,30,90 (janelas autorizadas).
  --connection   opcional: restringe a uma conexão (precisa ser do workspace).
  --apply        executa as escritas; sem ele, dry-run (nada é escrito).
  --dry-run      explícito: mostra o plano sem escrever (padrão).`;

async function main(argv: string[]): Promise<number> {
  const parsed = parseResyncArgs(argv);
  if (!parsed.ok) {
    console.error(`served-ads:resync: ${parsed.error}`);
    console.error(USAGE);
    return 1;
  }
  const { plan } = parsed;
  console.log(
    JSON.stringify(
      {
        mode: plan.dryRun ? "dry-run" : "apply",
        workspaceId: plan.workspaceId,
        windows: plan.windows,
        ...(plan.connectionId ? { connectionId: plan.connectionId } : {}),
        effect: "new identified snapshot per account+window; history preserved",
      },
      null,
      2
    )
  );
  if (plan.dryRun) {
    console.log("dry-run: nada escrito. Reexecute com --apply para ressincronizar.");
    return 0;
  }
  // Só --apply carrega env, banco e API: dry-run e uso não precisam.
  await import("./load-env");
  const { executeResync } = await import("@/server/served-ads/resync");
  const results = await executeResync(plan);
  console.log(JSON.stringify({ results }, null, 2));
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`served-ads:resync: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
);
