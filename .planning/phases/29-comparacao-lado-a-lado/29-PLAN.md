---
phase: 29
name: Comparação Lado a Lado
wave: 1
depends_on: []
files_modified:
  - app/src/components/workspace/DerivationCard.tsx
  - app/src/components/workspace/DerivationsStep.tsx
  - app/src/components/workspace/DerivationComparisonModal.tsx
  - app/messages/pt-BR.json
  - app/messages/en.json
autonomous: true
---

# Plan 01: Comparação Lado a Lado

## Objective
Implementar comparação lado a lado de duas derivações com zoom sincronizado, trigger via botão Compare nos cards, e metadados visíveis.

## Requirements
- COMP-01: Usuário pode selecionar duas derivações para comparar lado a lado
- COMP-02: Visualização split-pane mostra ambas as derivações simultaneamente
- COMP-03: Usuário pode sincronizar zoom e pan entre as duas imagens
- COMP-04: Metadados de ambas as derivações são visíveis (CTA, formato, score, status)

## Tasks

### Wave 1

#### Task 1: Adicionar botão Compare no DerivationCard
- Adicionar prop `onCompare?: () => void` em DerivationCardProps
- Adicionar botão com ícone de balança/comparação no header do card
- Mostrar botão apenas quando derivação tem imagem (status completed/approved)
- Adicionar estado visual para modo de seleção (border verde quando selecionado)
- Adicionar translation keys: `compare`, `selectForCompare`

#### Task 2: Gerenciar estado de comparação no DerivationsStep
- Adicionar estado `comparisonMode: 'idle' | 'selecting' | 'comparing'`
- Adicionar estado `firstSelection: string | null`
- Handler `onCompareClick(id)`:
  - Se idle → entra em modo selecting, guarda firstSelection
  - Se selecting e clica no mesmo → cancela
  - Se selecting e clica em outro → abre comparação
- Passar `isCompareMode` e `isSelected` para cada DerivationCard
- ESC key listener para cancelar modo de seleção

#### Task 3: Estender DerivationComparisonModal com zoom/pan
- Adicionar estado `zoomLevel: number` (1.0 = fit, 2.0, 3.0)
- Adicionar estado `isSyncEnabled: boolean` (true por padrão)
- Adicionar handlers de zoom: wheel event, botões +/-, teclas +/-
- Adicionar pan: mousedown + mousemove quando zoom > 1
- Toggle de sincronização (botão com ícone de corrente)
- Reset zoom button (tecla 0 ou botão)
- Container de imagem com overflow hidden e transform scale/translate

#### Task 4: Adicionar metadados ao modal de comparação
- Manter metadados existentes (plataforma, formato, CTA, score, QA)
- Adicionar status badge (approved/rejected/pending)
- Adicionar data de criação formatada
- Layout em cards compactos abaixo de cada imagem

#### Task 5: Atualizar traduções
- `derivation.compare`: "Comparar"
- `derivation.compareTitle`: "Comparar Derivações"
- `derivation.selectForCompare`: "Selecionar para comparar"
- `derivation.approveA`: "Aprovar A"
- `derivation.approveB`: "Aprovar B"
- `derivation.rejectBoth`: "Rejeitar ambas"
- `derivation.zoomSync`: "Sincronizar zoom"
- `derivation.zoomIn`: "Aumentar zoom"
- `derivation.zoomOut`: "Diminuir zoom"
- `derivation.resetZoom`: "Resetar zoom"
- Equivalents em en.json

## Verification

### must_haves
- [ ] Dois botões Compare visíveis nos cards de derivação completadas
- [ ] Clique no primeiro ativa modo seleção (border verde no card)
- [ ] Clique no segundo abre modal com duas derivações
- [ ] Imagens renderizam em split-pane sem distorção
- [ ] Scroll wheel zooma ambas as imagens quando sync ativo
- [ ] Toggle desabilita sincronização
- [ ] Metadados (CTA, formato, score, status) visíveis para ambas
- [ ] Botões de ação (Aprovar A, Aprovar B, Rejeitar ambas) funcionam
- [ ] ESC fecha modal
- [ ] Traduções PT-BR e EN presentes

### Test Commands
- `cd app && npm run build` — compila sem erros
- `cd app && npm test` — todos os testes passam

## Success Criteria
1. Usuário pode clicar em "Compare" em uma derivação e selecionar uma segunda para comparar
2. Visualização split-pane renderiza ambas as imagens sem distorção
3. Zoom in/out em uma imagem sincroniza com a outra (quando sincronização está ativa)
4. Metadados (CTA, formato, score, status) são visíveis para ambas as derivações
5. Usuário pode sair do modo de comparação e voltar para a galeria
