# Auditoria de Qualidade de Código & Type Safety — ADScale_2

**Data:** 2026-05-23  
**Auditor:** Subagente autônomo de qualidade de código  
**Scope:** `app/src/**/*.ts`, `app/src/**/*.tsx`  
**Método:** Análise estática manual + `eslint --quiet`

---

## Resumo Executivo

| Métrica | Valor |
|---------|-------|
| Arquivos analisados | ~150+ |
| Problemas críticos | 8 |
| Problemas altos | 15 |
| Problemas médios | 22 |
| Problemas baixos | 18 |
| **Total** | **63** |
| Erros ESLint confirmados | 28 |

---

## A. Type Safety & TypeScript

### A1. `as` assertions perigosas (HIGH)
- **5 arquivos de AI** usam o mesmo pattern perigoso:
  ```ts
  response as unknown as { output_text?: string }
  ```
- **Arquivos:** `creative-diagnosis.ts`, `creative-score.ts`, `creative-qa.ts`, `landing-page.ts`, `competitor-analyzer.ts`
- **Risco:** Runtime crashes quando a API retorna formato inesperado
- **Recomendação:** Usar Zod schemas para validar respostas da OpenAI

### A2. Non-null assertions (`!`) (HIGH)
- Presentes em SQL raw queries e no derivation job
- **Risco:** `Cannot read property of undefined` em produção
- **Recomendação:** Verificar null/undefined com early returns ou Optional chaining

### A3. `any` implícito/explícito (MEDIUM)
- Dúzias de `as` assertions espalhadas em repositories, hooks e API routes
- Funções públicas sem tipos de retorno explícitos
- **Recomendação:** Habilitar `noImplicitAny` e `strictFunctionTypes`

---

## B. Code Smells

### B1. God Component — `BriefingStep.tsx` (CRITICAL)
- **1.318 linhas** em um único arquivo
- **Recomendação:** Decompor em sub-componentes: `BriefingForm`, `UploadZone`, `ReferencePicker`, etc.

### B2. Código duplicado (HIGH)
- `ALLOWED_TYPES` duplicado em **6 arquivos** de upload
- `getOpenAI()` recriado em **5 arquivos** de AI (deveria ser singleton/factory)
- Patterns de error handling repetidos em dezenas de API routes

### B3. Console logs esquecidos (LOW)
- `console.error` em `RestylingModal.tsx`
- Outros `console.log` espalhados em hooks de desenvolvimento

---

## C. Modernização / React 19

### C1. `setState` diretamente em `useEffect` (HIGH)
- **6 ocorrências** detectadas pelo ESLint
- **Risco:** Infinite loops, re-renders desnecessários
- **Recomendação:** Mover para event handlers ou usar `useLayoutEffect`

### C2. `require("react")` proibido (MEDIUM)
- Encontrado em `A11yProvider.tsx`
- **Recomendação:** Usar ESM imports consistentemente

### C3. `handleLogoUpload` acessado antes da declaração (MEDIUM)
- Em `BrandKitTab.tsx`
- **Recomendação:** Reordenar declarações ou usar function declarations

---

## D. ESLint & Linting

- **28 erros confirmados** rodando `eslint --quiet`
- Categorias: `any` em testes, setState em effect, require imports, variáveis não usadas

---

## Top 10 Problemas Críticos para Priorizar

| # | Problema | Arquivo | Severidade |
|---|----------|---------|------------|
| 1 | `BriefingStep.tsx` com 1.318 linhas | `components/workspace/BriefingStep.tsx` | CRITICAL |
| 2 | Endpoint de webhook sem auth | `api/notifications/webhook` | CRITICAL |
| 3 | `as` assertions em respostas OpenAI | `server/ai/*.ts` (5 arquivos) | HIGH |
| 4 | Non-null assertions em SQL/jobs | `server/jobs/derivation.ts` | HIGH |
| 5 | `ALLOWED_TYPES` duplicado | 6 arquivos de upload | HIGH |
| 6 | `getOpenAI()` recriado | 5 arquivos AI | HIGH |
| 7 | setState em useEffect | 6 ocorrências | HIGH |
| 8 | Headers de segurança inexistentes | `next.config.ts` | HIGH |
| 9 | Prompt injection em campos de campanha | `server/ai/*.ts` | HIGH |
| 10 | Rate limiter "fail open" | `lib/rate-limit.ts` | HIGH |

---

## Recomendações Gerais

1. **Extrair factory `getOpenAI()`** para `server/ai/openai-client.ts`
2. **Criar utilitário `validateAIResponse<T>()`** com Zod para todas as chamadas OpenAI
3. **Decompor `BriefingStep.tsx`** em ~8 sub-componentes
4. **Centralizar `ALLOWED_TYPES`** em `lib/upload-config.ts`
5. **Habilitar `no-console`** em produção no ESLint
6. **Adicionar `no-non-null-assertion`** ao ESLint config
7. **Refatorar hooks** com setState em useEffect para padrão de evento
8. **Adicionar tipos de retorno** em todas as funções públicas
9. **Usar `satisfies`** em vez de `as` onde possível
10. **Implementar code splitting** para componentes pesados
11. **Adicionar importação ordenada** no ESLint
12. **Criar barrel exports** (`index.ts`) para cada módulo
13. **Documentar padrões de código** em `docs/CODING-STANDARDS.md`
