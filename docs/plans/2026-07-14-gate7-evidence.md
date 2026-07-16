# Gate 7 — evidência de deleção e simplificação

**Data:** 2026-07-14
**Veredito:** aprovado tecnicamente

## Critério

> Não há segunda árvore de produto e toda função visível sustenta a jornada central ou tem evidência de uso.

## Evidência

| Verificação | Resultado |
|---|---|
| Árvore paralela `/v6` | Removida; o gate não encontra rota, literal ou módulo residual. |
| Landing Page e Persona Simulation | Sem entrada em navegação, Assistente ou Quick Tools. Engines e APIs permanecem congelados e invisíveis para compatibilidade. |
| Performance import / hipóteses | UI, rotas, serviços, repositórios, memória e tipos removidos por ausência de uso real. |
| Persistência aposentada | Sete tabelas órfãs saíram do schema ativo. A migração `0074` recusa executar se qualquer uma contiver dados e não usa `CASCADE`. |
| Output learning | Preservado como loop canônico ativo; schema agrupado com `output_decision_events`. |
| Persistência por domínio | Brand Kit passou de `db/repositories` para o diretório canônico `server/repositories`; nenhum adapter genérico foi criado. |
| Painel owner de qualidade | Analytics de produto separado do corpus; cada tarefa analítica possui componente e consulta próprios e só monta quando ativa. |
| Inventário de superfícies | 14 páginas, 161 APIs e 65 CTAs; um CTA inerte possui decisão 1:1 de esconder. As seis superfícies curadas têm decisão explícita. |
| Destinos primários | Campanha, Assistente, Criar Post, Brand Training e Templates permanecem como os únicos destinos permitidos. |

## Verificações executadas

- `npm run typecheck` — passou.
- Testes focados de Brand Kit e output learning — 99/99 passaram.
- `npm test` — 3.685 passaram, 7 ignorados; 573 arquivos passaram.
- `PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP=1 npm run convergence:gate` — passou.
- `npm run build` — passou; 93 páginas estáticas e 161 rotas de API inventariadas.
- Migração `0074` em transação revertida com dados — bloqueio `55000` confirmado.
- Migração `0074` em transação revertida após esvaziar as tabelas — legado removido e tabelas ativas de output learning preservadas.

O Docker local não estava disponível para recriar o banco do zero. A cadeia destrutiva relevante foi validada diretamente em PostgreSQL dentro de transações revertidas, sem alterar o banco local.

## Conclusão

O produto tem uma única árvore visível e os módulos restantes sustentam a jornada criativa, módulos de apoio aprovados ou operação owner com evidência. A Fase 8 pode começar; o freeze de novas funções continua até o Gate 8.
