# C01 after — Campanha Horizonte Educação no desktop

## Resultado

Falhou antes da primeira prévia.

- Início: 15/07/2026 08:50:00 BRT
- Fim: 15/07/2026 09:03:53 BRT
- Campanha: `07ff1668-fa80-478d-9c98-56bc3ffff9d8`
- Thread do Assistente: `9befaf85-dbe8-4bcc-95f6-6a61c5c90b5f`

## O que melhorou

- O Assistente criou a conversa e exibiu o composer corretamente.
- Não houve `signal timed out` no Assistente.

## O que bloqueou

- A estrutura obrigatória de campanha foi percebida como burocracia antes do trabalho criativo.
- **Continuar para ações** não avançou sem imagem.
- O estágio **Produzir** permitiu burlar essa exigência.
- **Gerar variações** retornou `Falha ao enfileirar prévia` e a API respondeu 400.
- O banco terminou com zero assets e zero derivações.

## Leitura brutalmente honesta

A correção do Assistente funcionou, mas a campanha ainda não sustenta criação do zero. O produto apresenta dois contratos contraditórios na mesma tela: um caminho bloqueia sem imagem e outro deixa avançar para falhar mais tarde. Isso não é orientação; é uma armadilha de navegação.

Um `ChunkLoadError` intermediário foi causado por reinício automático do Next.js local por memória e não foi classificado como falha do produto, pois o cenário foi retomado e o bloqueio final reproduziu com o servidor estável.
