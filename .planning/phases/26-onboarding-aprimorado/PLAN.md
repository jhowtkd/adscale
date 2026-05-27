# Plan: Phase 26 — Onboarding Aprimorado

## Overview

Melhorar o onboarding existente adicionando tooltips contextuais em features complexas, permitir reinício do tour nas settings, e expandir o tour para cobrir mais elementos do dashboard.

## Requirements

- [ ] **ONB-01**: Novo usuário vê um onboarding step-by-step no primeiro login (welcome tour)
- [ ] **ONB-02**: Onboarding pode ser reiniciado a qualquer momento nas settings
- [ ] **ONB-03**: Tooltips contextuais explicam features principais (campanha, upload, geração, review)
- [ ] **ONB-04**: Progresso do onboarding é salvo no banco de dados (per-user)
- [ ] **ONB-05**: Onboarding é skipável e não bloqueia o uso do app

## Tasks

### Tour Improvements (ONB-01, ONB-05)

- [ ] Add step 4 to OnboardingTour: "New Campaign" CTA explanation
  - Target: `[data-tour-step="4"]` on "+ Nova Campanha" button
  - Title: "Criar Nova Campanha"
  - Description: "Clique aqui para iniciar uma nova campanha. Você pode escolher criar do zero ou usar um template."
  - Placement: bottom
  
- [ ] Add step 5 to OnboardingTour: Credit panel explanation  
  - Target: `[data-tour-step="5"]` on CreditPanel
  - Title: "Seus Créditos"
  - Description: "Acompanhe seus créditos disponíveis e consumo mensal. Upgrade quando precisar de mais."
  - Placement: left

- [ ] Add `data-tour-step="4"` to "+ Nova Campanha" button in dashboard
- [ ] Add `data-tour-step="5"` to CreditPanel wrapper
- [ ] Update i18n keys for new steps

### Contextual Tooltips (ONB-03)

- [ ] Create `InfoTooltip` component
  - Uses Radix Popover (already in project)
  - ℹ️ icon trigger, hover to show
  - Max-width 280px, dark theme matching app
  - Supports rich content (text + links)
  
- [ ] Add tooltip to "Perfil de Criatividade" in GenerationStep
  - Text: "Define o nível de variação visual nas derivações. Conservador mantém mais do original, audaz cria variações mais distintas."
  
- [ ] Add tooltip to "Modo de Geração" in GenerationStep
  - Text: "Variação de arte: mantém a essência visual. Adaptação de formato: ajusta para diferentes proporções. Restyling: aplica um novo estilo visual."
  
- [ ] Add tooltip to "CTA" field in GenerationStep
  - Text: "Call-to-Action: o texto que aparece no botão da peça. A IA sugere opções baseadas no contexto da campanha."

- [ ] Add tooltip to "Upload da Peça Chave" in BriefingStep
  - Text: "Upload da imagem base que será usada para criar variações. A IA analisa a imagem para sugerir campos do brief."

### Settings Integration (ONB-02)

- [ ] Create new Settings tab: "Geral" (or add to existing tab)
  - Section: "Preferências de Onboarding"
  - Button: "Reiniciar Tour de Boas-vindas" 
  - Text: "O tour será exibido novamente na próxima visita ao dashboard."
  - Only visible if onboarding is completed
  
- [ ] Create `POST /api/user/onboarding/restart` endpoint
  - Sets `onboardingCompletedAt` to NULL
  - Returns `{ success: true }`
  
- [ ] Add `restartTour()` mutation to `useOnboarding` hook
  - Invalidates `onboarding-status` query
  - Shows toast: "Tour reiniciado. Será exibido na próxima visita ao dashboard."

### Persistence (ONB-04) — Already Working

- [ ] Verify existing schema supports decisions
  - `user.onboardingCompletedAt` timestamp ✓
  - GET/POST `/api/user/onboarding` ✓
  - `useOnboarding` hook ✓
  - No schema changes needed

## Acceptance Criteria

1. Tour shows 5 steps on dashboard (header, quick actions, campaign list, new campaign, credits)
2. Each step auto-positions based on viewport
3. User can skip tour at any step with X button
4. After completing/skipping, tour doesn't show again
5. "Reiniciar Tour" button in Settings resets onboarding status
6. After restart, tour shows on next dashboard visit
7. Info tooltips appear on hover for 4 complex features
8. Tooltips are accessible (keyboard focusable)
9. All text uses i18n (PT-BR)
10. No console errors, build passes

## Risks

| Risk | Mitigation |
|------|------------|
| Tour element targets break if UI changes | Use stable `data-tour-step` attributes, not CSS selectors |
| Tooltips may clutter UI | Only on genuinely complex features, not every field |
| Settings tab proliferation | Add to existing "Profile" or "Preferences" tab if exists |

## Dependencies

- None — builds on existing onboarding infrastructure

## Estimation

- Tour expansion: 2h
- InfoTooltip component: 1.5h
- Tooltips integration (4 locations): 1h
- Settings restart: 1.5h
- i18n + polish: 1h
- **Total: ~7h**

## Verification

- [ ] `npm run build` passes
- [ ] `npm run test` passes (448 tests)
- [ ] Manual test: signup → dashboard → tour appears → skip → no reappear
- [ ] Manual test: Settings → restart → dashboard → tour reappears
- [ ] Manual test: hover over ℹ️ icons → tooltip shows
