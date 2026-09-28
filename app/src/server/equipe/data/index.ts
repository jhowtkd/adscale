// Persistência da Equipe (compartimento adscale_equipe).
// - types: registros, entradas, filtros, erros;
// - repositories: interfaces (contrato);
// - postgres*: implementação Postgres (recebe o executor; sem db global);
// - memory: implementação em memória com o mesmo comportamento.
export * from "./types";
export * from "./repositories";
export * from "./memory";
export * from "./postgres";
export * from "./postgres-production";
export * from "./postgres-dispatch";
