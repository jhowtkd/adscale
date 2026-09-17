import { parseCleanupArgs } from "../src/server/diagnostics/content-cleanup";

/**
 * Diagnostic retention cleanup CLI (trace-391).
 *
 * Dry-run is the default and only --apply writes. Local scope: expired
 * diagnostic_events (30d) and diagnostic_access_audit (90d) rows, with an
 * optional --workspace restriction. The remote AI-trace step is reported
 * as unconfigured: remote deletion is proven against a fake endpoint in
 * tests only — wiring a real vendor needs its own ticket + data-owner
 * approval, which does not exist.
 */

const USAGE = `Uso:
  diagnostics:cleanup [--workspace <uuid>] [--limit <n>] [--dry-run|--apply]

  --workspace   opcional: restringe a um workspace.
  --limit       opcional: máximo de linhas por tabela (padrão 1000).
  --dry-run     mostra o plano sem escrever (padrão).
  --apply       executa as exclusões locais; sem ele, nada é escrito.`;

async function main(argv: string[]): Promise<number> {
  const parsed = parseCleanupArgs(argv);
  if (!parsed.ok) {
    console.error(`diagnostics:cleanup: ${parsed.error}`);
    console.error(USAGE);
    return 1;
  }
  await import("./load-env");
  const { cleanupDiagnosticData } = await import(
    "@/server/diagnostics/content-cleanup"
  );
  const result = await cleanupDiagnosticData(new Date(), {
    dryRun: parsed.plan.dryRun,
    workspaceId: parsed.plan.workspaceId,
    limit: parsed.plan.limit,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.dryRun) {
    console.log("dry-run: nada escrito. Reexecute com --apply para gravar.");
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `diagnostics:cleanup: failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
