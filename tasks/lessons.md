# Lessons

## 2026-05-17 — Novas funcoes vs melhorias

- Quando o usuario pedir novas funcoes/features, separar isso de melhorias incrementais do fluxo existente.
- Priorizar capacidades novas de produto, novas superficies ou novos jobs que o app ainda nao faz.
- Se uma sugestao apenas deixa uma etapa atual mais clara, rapida ou confiavel, rotular como melhoria e nao como funcao nova.

## 2026-05-21 — Validar chaves i18n por superficie

- Quando corrigir `MISSING_MESSAGE`, buscar todos os `t("...")` da superficie inteira, nao so a chave do primeiro erro.
- Conferir componentes irmaos que compartilham namespace de traducao, como modal rapido e pagina dedicada.
- Depois de adicionar chaves, recarregar a rota que falhou e verificar se nao surgiu a proxima chave ausente.
