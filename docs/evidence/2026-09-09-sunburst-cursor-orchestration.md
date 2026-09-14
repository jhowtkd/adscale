# Sunburst — orquestração Codex/Cursor

## Estado atual

- Data: 2026-09-09, America/Sao_Paulo.
- Coordenador/revisor: Codex. Autor de implementação: Cursor, escolhido pelo usuário.
- Projeto: /Users/jhonatan/Repos/ADScale_2.
- Base verificada: ac38a30e (feat: persist brand-scoped commercial offers with validity).
- Git: nenhum diff rastreado; diversos arquivos/diretórios não rastreados de outras tarefas. Não adicionar, remover ou sobrescrever esse WIP.
- Executor descoberto: /Users/jhonatan/.local/bin/cursor-agent.
- Autenticação: `cursor-agent status` retornou `Not logged in`; catálogo de modelos indisponível sem autenticação.
- Modelo: preservar o configurado; ainda não verificado. Consumo e inclusão na cota: desconhecidos; não comprar excedentes nem trocar de provedor.
- Cursor Desktop: tentativa via ferramenta de computer use falhou com ScreenCaptureKit -3811; nenhum briefing enviado pela interface.
- Login oficial tentado: processo exec 95445 encerrou com código 1 e mensagem `Login failed or timed out`. Não há processo de login ativo nem sessão de implementação. O usuário precisa concluir `cursor-agent login` no próprio terminal.
- Sessão Cursor de implementação: ainda não criada; nenhum pedido de inferência enviado.
- Diretório de execução: preparar worktree isolado codex/sunburst-quality a partir da base verificada antes do despacho; copiar apenas os quatro documentos de plano não rastreados relacionados abaixo. Não perder contexto desses planos.

## Briefing para o Cursor

Objetivo: executar a parte local dos três planos Sunburst, incluindo investigação dos callers, implementação, testes, correções e protocolo de validação. Qualidade visual é prioridade; não reduzir modelo/qualidade para economizar. Não parar após o primeiro plano se houver etapas locais independentes restantes.

Ler primeiro AGENTS.md, app/AGENTS.md, CONTEXT.md e instruções de domínio aplicáveis. Fazer descoberta por Graphify conforme regras. O código atual é autoridade para nomes e tipos; corrigir erros dos snippets dos planos com o mínimo de mudança que preserve seus critérios de aceite.

Planos, relativos à raiz:
1. docs/plans/2026-09-08-gpt-image-2-5-ice.md
2. docs/superpowers/plans/2026-09-08-sunburst-engine.md
3. docs/superpowers/plans/2026-09-08-sunburst-visual-quality.md
4. docs/superpowers/plans/2026-09-08-sunburst-layer-regeneration.md

Autor único das alterações: Cursor. Codex revisa sem editar simultaneamente. Não criar outros executores. Não tocar trabalho não relacionado, configurações globais, credenciais ou integrações fora do escopo. Sem force/yolo, sandbox desabilitado ou aprovação irrestrita de MCPs.

Escopo: política congelada modelo/qualidade; transporte canônico; observação de chamadas antes de processamento; preservação de evidência em correções; preparação/replay simples e carrossel; invariantes de revisão; configuração reservada para regeneração de camadas. Usar contratos internos JSON aditivos previstos pelos planos, mantendo compatibilidade e CAS. Nenhuma nova dependência, tabela, endpoint público ou UI.

Preservar: geração controlada para testes; 50 créditos; maxRetries 0; orçamento direto e política legada distintos; flags existentes; PNG/alpha e quotas/lease do editor; referências e assets exatos; trabalhos antigos no modelo congelado. Percentual Sunburst permanece 0. Não ativar Flare, streaming, máscaras ou 4K.

Verificações: testes existentes focalizados com transporte mockado, typecheck, git diff --check, graphify update após alterações. Antes de executar testes, conferir isolamento: nenhum banco de produção ou chamada paga. Não executar benchmark/harness com API real, deploy, push, publicação, migração ou geração paga. Preparar corpus/protocolo e limites de orçamento com fontes locais autorizadas; se faltar corpus, registrar a lacuna e concluir o restante local.

Marcos: (A) motor e evidências; (B) revisão/referências/protocolo visual; (C) camadas; (D) revisão final e correções. Manter este registro atualizado com sessão real, diretório, commits, etapas completas/restantes, comandos e resultados. Guardar logs de testes em arquivos locais, informar caminhos. Retorno compacto por marco: mudanças, evidência, pendências e próximo passo. Não chamar resultado de DONE com testes faltantes ou confundir teste mockado com ganho visual.

## Próximo passo

Concluir autenticação oficial. Revalidar `cursor-agent status`, catálogo/modelo e mecanismo de execução; preparar isolamento e despachar o briefing sem duplicar sessão. Acompanhar até fechar todas as etapas locais autorizadas. Benchmark pago e deploy continuam pendentes de autorização específica, com resultado concreto para revisão.
