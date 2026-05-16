# Novas Sugestoes de Melhorias

Date: 2026-05-16
Mode: Brainstorming only

## Checklist

- [x] Revisar contexto do projeto, instrucoes locais e trabalho recente
- [x] Mapear superficies atuais do app e planos existentes
- [x] Propor 2-3 abordagens de melhoria com trade-offs
- [x] Escolher uma direcao com o usuario antes de escrever design doc
- [x] Documentar resultado aprovado em `docs/plans/YYYY-MM-DD-<topic>-design.md`
- [x] Transicionar para plano de implementacao apos aprovacao

## Notes

- Nao implementar nesta etapa. O objetivo e descobrir a proxima melhoria com melhor retorno para o ADScale.

## Review

### Contexto observado

- O fluxo demo-ready atual esta centrado em `art_variation`: briefing, upload, diagnostico criativo, nivel de variacao, galeria, score, regeneracao e export.
- A home ja tem quick tool de restilizacao com modal e API.
- O produto tem scoring/regeneracao assistiva, mas ainda pode melhorar a confianca do usuario na escolha final e no controle do resultado.

### Sugestoes candidatas

1. Creative QA antes de exportar: checklist visual/factual por derivacao aprovada.
2. Comparador de vencedor: ranking explicavel entre as melhores variacoes.
3. Pacote de entrega multi-formato: transformar a melhor peca em adaptacoes finais para export.

### Direcao escolhida

- O usuario escolheu Pacote de entrega multi-formato.
- Contexto tecnico atual: `format_adaptation` ja usa o job de derivacao com `images.edit()` quando ha asset e target format unico; a rota atual de gerar derivacoes cria um job por configuracao de campanha, nao um pacote a partir de uma derivacao vencedora.
- Decisao de UX: sempre mostrar `1:1`, `4:5` e `9:16`, mas permitir desmarcar formatos antes de confirmar a geracao.
- Abordagem aprovada: pacote a partir da derivacao aprovada, com novas derivacoes filhas vinculadas ao vencedor.

### Documentos criados

- `docs/plans/2026-05-16-delivery-package-multiformat-design.md`
- `docs/plans/2026-05-16-delivery-package-multiformat.md`
