/**
 * Gate de reconciliação do relatório Anúncios veiculados (ICE-01B).
 * Contrato da API usada + reconciliação guardado × resposta real
 * autorizada. Exit codes:
 * - 0: reconciliado (contrato válido, zero divergência);
 * - 1: falha (violação de contrato, divergência, uso ou erro);
 * - 2: pendente (sem acesso à Meta — aceite de produção segue pendente).
 */

const USAGE = `Uso:
  served-ads:reconcile-gate --workspace <uuid> --brand <uuid> [--windows 7,30,90]

  --workspace  obrigatório: escopo do gate.
  --brand      obrigatório: marca do relatório.
  --windows    opcional: subconjunto de 7,30,90 (padrão: todas).`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GateArgs =
  | { ok: true; workspaceId: string; brandId: string; windows: Array<7 | 30 | 90> }
  | { ok: false; error: string };

function parseGateArgs(argv: string[]): GateArgs {
  let workspaceId: string | undefined;
  let brandId: string | undefined;
  let windowsRaw: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--workspace") workspaceId = argv[++i];
    else if (arg === "--brand") brandId = argv[++i];
    else if (arg === "--windows") windowsRaw = argv[++i];
    else return { ok: false, error: `unknown_flag:${arg}` };
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) return { ok: false, error: "workspace_required" };
  if (!brandId || !UUID_RE.test(brandId)) return { ok: false, error: "brand_required" };
  const windows: Array<7 | 30 | 90> = [];
  for (const piece of (windowsRaw ?? "7,30,90").split(",")) {
    const n = Number(piece.trim());
    if (n !== 7 && n !== 30 && n !== 90) return { ok: false, error: `window_unauthorized:${piece.trim()}` };
    if (!windows.includes(n)) windows.push(n);
  }
  return { ok: true, workspaceId, brandId, windows };
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseGateArgs(argv);
  if (!parsed.ok) {
    console.error(`served-ads:reconcile-gate: ${parsed.error}`);
    console.error(USAGE);
    return 1;
  }
  await import("./load-env");
  const { runReconcile } = await import("@/server/served-ads/reconcile");
  const outcome = await runReconcile({
    workspaceId: parsed.workspaceId,
    brandId: parsed.brandId,
    windows: parsed.windows,
  });
  console.log(JSON.stringify(outcome, null, 2));
  return outcome.status === "pass" ? 0 : outcome.status === "pending" ? 2 : 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`served-ads:reconcile-gate: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
);
