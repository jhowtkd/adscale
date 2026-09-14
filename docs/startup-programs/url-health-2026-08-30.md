# Saúde dos links da fila

Verificação somente leitura em 2026-08-30, após a normalização das URLs da fila. Foi feito `curl -L` com timeout de 15s e user-agent de navegador para os 191 registros; o status final indica disponibilidade do endereço, não confirma elegibilidade, benefício ou termos vigentes.

| Resultado | Quantidade | Interpretação |
| --- | ---: | --- |
| `200` | 175 | Endereço respondeu; ainda exige validação da oferta |
| `403` | 13 | Bloqueio anti-bot, login ou conteúdo protegido; não prova encerramento |
| `404` | 2 | Rota removida ou inexistente; não enviar sem localizar fonte oficial atual |
| sem URL | 1 | Linha-modelo de contribuição |

## Endereços que exigem revisão manual

403 observados: Akamai (IDs 9/10), Snowflake (54), OpenAI (69), Perplexity (82), Memberstack (108), Make (120), Netcore (135), Autodesk (169), MathWorks (171), Webflow (175) e RemotePass (184/185). Podem ser proteção anti-bot ou login.

404 observados: xAI console (86) e LaunchDarkly (94). Ambos já estão classificados como `SKIP` na fila por não apresentarem rota startup atual verificável.

Nenhum link foi submetido, conta criada, método de pagamento adicionado ou formulário aberto com dados pessoais. A fila principal permanece a fonte de disposição (`APPLY`, `BLOCKED`, `SKIP`); esta página registra apenas a saúde dos endereços no momento da checagem.
