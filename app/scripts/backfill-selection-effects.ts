import { parseBackfillArgs } from "../src/server/application/backfill-selection-effects-plan";

/**
 * Backfill de efeitos de seleção (ICE-03B). Dry-run padrão, escopo opcional
 * por workspace; --apply grava. Somente recibos comprovados — outputs
 * selecionados cujo jsonb legado ainda carrega um receipt de receita —
 * viram obrigações recipe na outbox, com a data original do recibo.
 */

const USAGE = `Uso:
  selection-effects:backfill [--workspace <uuid>] [--limit <n>] [--apply]

  --workspace   opcional: restringe a um workspace.
  --limit       opcional: máximo de linhas avaliadas (padrão 100).
  --apply       executa as escritas; sem ele, dry-run (nada é escrito).
  --dry-run     explícito: mostra o plano sem escrever (padrão).`;

async function main(argv: string[]): Promise<number> {
  const parsed = parseBackfillArgs(argv);
  if (!parsed.ok) {
    console.error(`selection-effects:backfill: ${parsed.error}`);
    console.error(USAGE);
    return 1;
  }
  if (parsed.plan.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          ...(parsed.plan.workspaceId ? { workspaceId: parsed.plan.workspaceId } : {}),
          limit: parsed.plan.limit,
          effect:
            "proven recipe receipts become pending outbox rows with the original receipt date; nothing else is created",
        },
        null,
        2,
      ),
    );
    // Dry-run ainda lê o banco para listar candidatos — mas nunca escreve.
    await import("./load-env");
    const { executeSelectionEffectsBackfill } = await import(
      "@/server/application/backfill-selection-effects"
    );
    const result = await executeSelectionEffectsBackfill(parsed.plan);
    console.log(JSON.stringify(result, null, 2));
    console.log("dry-run: nada escrito. Reexecute com --apply para gravar.");
    return 0;
  }
  await import("./load-env");
  const { executeSelectionEffectsBackfill } = await import(
    "@/server/application/backfill-selection-effects"
  );
  const result = await executeSelectionEffectsBackfill(parsed.plan);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `selection-effects:backfill: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  },
);
