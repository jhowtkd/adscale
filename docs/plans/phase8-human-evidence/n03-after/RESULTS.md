# N03 after — Assistente sem campanha no desktop

## Resultado

Falhou no primeiro envio por abort local e estado de streaming não terminalizado.

- Início: 15/07/2026 14:27:14 BRT
- Fim: 15/07/2026 14:33:52 BRT
- Thread: `275db726-d339-41f8-857c-09ee45ed08cd`
- Marca: Phase8 Human Studio Pulso
- Entrada: Assistente sem campanha, desktop

## Evidência objetiva

- O thread foi criado e a interface exibiu a mensagem do participante de forma otimista.
- A tela permaneceu em `Assistente respondendo...` por mais de seis minutos.
- O banco contém o thread, mas zero mensagens, zero ações e zero goal runs para ele.
- O painel lateral mostrou simultaneamente `Nenhuma ação pendente` e `Nenhum job ativo`.
- O primeiro envio é disparado em um efeito e consumido antes de concluir.
- No Strict Mode de desenvolvimento, a limpeza de `useAssistantChat` aborta o controller recém-criado.
- O caminho de abort retorna sem erro e só limpa `isStreaming` quando não houve abort ou quando `signal.reason === "timeout"`; o abort de limpeza não satisfaz nenhuma condição.

## Leitura brutalmente honesta

O assistente não chegou ao provider. A UI inventou progresso local, cancelou a própria requisição e depois perdeu a capacidade de sair do loading. Para o usuário parece uma IA lenta; na prática, nenhum trabalho começou e nenhuma recuperação é oferecida.
