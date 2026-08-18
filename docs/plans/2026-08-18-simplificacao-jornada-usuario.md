# Simplificação da Jornada do Usuário — 5 Planos de Execução

> **Contexto:** Auditoria de ponta a ponta (signup → asset exportado) identificou que a jornada
> atual tem ~30 fases / 50+ interações no caminho mais longo. As causas são estruturais:
> três gerações de fluxo de criação coexistem, ~6 entradas redundantes levam ao mesmo composer,
> o paywall só aparece DEPOIS que o usuário montou tudo, e há 5 vocabulários sobrepostos.
>
> **Público deste documento:** um agente executor com zero contexto. Cada plano é autocontido,
> cirúrgico e de baixo risco. Siga os passos NA ORDEM. Não improvise. Se um passo de verificação
> falhar, PARE e aplique o Rollback daquele plano.
>
> **Comandos de verificação padrão** (rode sempre de dentro de `app/`):
> - Typecheck: `npm run typecheck`
> - Lint: `npm run lint`
> - Testes: `npm run test`
> - Build (só no final de cada plano): `npm run build`
>
> **Ordem recomendada de execução:** Plano 4 → Plano 2 → Plano 3 → Plano 1 → Plano 5.
> (Primeiro deleta-se o que está morto, depois fecha-se entradas, depois mexe-se no gate de
> billing por último porque é o mais sensível. Vocabulário por último porque é cosmético.)

---

## Índice

| Plano | Título | Risco | Tamanho |
|---|---|---|---|
| 1 | Antecipar o gate de billing para ANTES do compose | Médio | Médio |
| 2 | Fechar a criação de campanha legada | Baixo | Pequeno |
| 3 | Consolidar as entradas de criação em uma porta | Baixo | Pequeno |
| 4 | Deletar remanescentes órfãos | Baixo | Médio |
| 5 | Unificar o vocabulário visível | Baixo | Pequeno |

---
---

# PLANO 1 — Antecipar o gate de billing para ANTES do compose

## Objetivo
Hoje o usuário sem acesso (`hasSpendAccess === false`) monta o trabalho inteiro, clica em
"Gerar", e só então recebe um erro 402. Este plano adiciona um painel de desbloqueio no TOPO
da Home, visível antes de o usuário compor. É uma mudança ADITIVA: nada do que existe hoje é
removido ou alterado em comportamento. O 402 no "Gerar" continua existindo como backstop.

## Risco
Médio. É o plano mais sensível porque toca billing. Mas a mudança é apenas adicionar um
componente de leitura (`useBillingStatus`) e dois CTAs que já existem (`useRedeemBetaAccess`,
`useStartCheckout`). Nenhuma lógica de cobrança é alterada.

## Arquivos
- **Criar:** `app/src/components/billing/AccessGatePanel.tsx`
- **Modificar:** `app/src/components/dashboard/DashboardHomeActions.tsx`
- **Modificar:** `app/messages/en.json`
- **Modificar:** `app/messages/pt-BR.json`

## Passo a passo

### Passo 1.1 — Criar o componente `AccessGatePanel.tsx`

Crie o arquivo `app/src/components/billing/AccessGatePanel.tsx` com EXATAMENTE este conteúdo:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useBillingStatus,
  useRedeemBetaAccess,
  useStartCheckout,
} from "@/lib/hooks/use-billing";

export function AccessGatePanel() {
  const t = useTranslations("billing.accessGate");
  const { data: billing, isLoading } = useBillingStatus();
  const redeem = useRedeemBetaAccess();
  const checkout = useStartCheckout();
  const [code, setCode] = useState("");

  if (isLoading || !billing) return null;
  if (billing.access.hasSpendAccess) return null;

  const handleRedeem = async () => {
    if (!code.trim()) return;
    try {
      await redeem.mutateAsync(code.trim());
      setCode("");
    } catch {
      // o erro é exibido pelo bloco redeem.isError abaixo
    }
  };

  const handleCheckout = async () => {
    try {
      await checkout.mutateAsync({ planKey: "starter", returnPath: "/" });
    } catch {
      // erro de checkout é exibido pelo bloco checkout.isError abaixo
    }
  };

  return (
    <section
      aria-labelledby="access-gate-title"
      className="rounded-[var(--radius-object)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-5 sm:p-6"
    >
      <h2
        id="access-gate-title"
        className="text-base font-semibold text-[var(--text-primary)]"
      >
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("description")}</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("betaCodePlaceholder")}
            className="sm:max-w-xs"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleRedeem()}
            disabled={redeem.isPending || !code.trim()}
          >
            {redeem.isPending ? t("redeeming") : t("redeem")}
          </Button>
        </div>
        <Button
          type="button"
          onClick={() => void handleCheckout()}
          disabled={checkout.isPending}
        >
          {checkout.isPending ? t("redirecting") : t("checkout")}
        </Button>
      </div>

      {redeem.isError ? (
        <p className="mt-2 text-xs text-[var(--danger-text)]">
          {redeem.error instanceof Error ? redeem.error.message : t("redeemError")}
        </p>
      ) : null}
      {checkout.isError ? (
        <p className="mt-2 text-xs text-[var(--danger-text)]">
          {checkout.error instanceof Error ? checkout.error.message : t("redeemError")}
        </p>
      ) : null}
    </section>
  );
}
```

**Não mude nada neste código.** As APIs `useBillingStatus`, `useRedeemBetaAccess` e
`useStartCheckout` já existem em `app/src/lib/hooks/use-billing.ts` (verificado). O campo
`billing.access.hasSpendAccess` já existe no tipo `BillingStatus`.

### Passo 1.2 — Renderizar o painel na Home

Abra `app/src/components/dashboard/DashboardHomeActions.tsx`.

**1.2.a** — Adicione o import. Localize o bloco de imports no topo (linhas 1–17) e adicione
esta linha junto aos demais imports de `@/components/...`:

```tsx
import { AccessGatePanel } from "@/components/billing/AccessGatePanel";
```

**1.2.b** — Renderize o painel. Localize o `return` principal (por volta da linha 142):

```tsx
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <CreativeToolCards
```

Insira `<AccessGatePanel />` IMEDIATAMENTE após a `<div>` abertura e ANTES de
`<CreativeToolCards`, ficando:

```tsx
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <AccessGatePanel />
      <CreativeToolCards
```

**É só isso neste arquivo.** Não altere mais nada.

### Passo 1.3 — Adicionar as chaves i18n

Abra `app/messages/en.json`. Localize o objeto `"billing"` (ele já contém a chave
`"conversion"`). DENTRO do objeto `"billing"`, adicione a chave `"accessGate"` com este valor:

```json
"accessGate": {
  "title": "Unlock your workspace",
  "description": "You need an active plan or a beta code to generate creatives. Redeem a code below or start a plan.",
  "betaCodePlaceholder": "Beta code",
  "redeem": "Redeem",
  "redeeming": "Redeeming...",
  "redeemError": "Could not unlock access. Try again.",
  "checkout": "Start a plan",
  "redirecting": "Redirecting..."
}
```

Abra `app/messages/pt-BR.json`. Localize o objeto `"billing"` e adicione a MESMA chave
`"accessGate"` com os valores em português:

```json
"accessGate": {
  "title": "Libere seu workspace",
  "description": "Você precisa de um plano ativo ou de um código beta para gerar criativos. Resgate um código abaixo ou comece um plano.",
  "betaCodePlaceholder": "Código beta",
  "redeem": "Resgatar",
  "redeeming": "Resgatando...",
  "redeemError": "Não foi possível liberar o acesso. Tente novamente.",
  "checkout": "Começar um plano",
  "redirecting": "Redirecionando..."
}
```

**Atenção:** garanta que o JSON continue válido (vírgulas corretas). Rode o passo de
verificação de JSON abaixo.

## O que NÃO mexer
- NÃO altere `app/src/server/billing/*` (paywall, access, credits). Nenhuma lógica de cobrança.
- NÃO altere o comportamento do botão "Gerar" nem o 402 existente. Este plano só ADICIONA um
  painel informativo antes do compose.
- NÃO remova `ConversionCta.tsx` nem nenhum componente de billing existente.
- NÃO troque a ordem dos elementos existentes em `DashboardHomeActions.tsx`; apenas insira o
  painel no topo.

## Verificação
Rode, de dentro de `app/`:

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/pt-BR.json','utf8')); console.log('JSON OK')"
npm run typecheck
npm run lint
npm run test
```

Todos devem passar. Se algum teste de snapshot/DSL quebrar por causa do novo elemento na Home,
avalie se é um teste que asserta a estrutura exata da Home; nesse caso, atualize APENAS a
expectativa desse teste para incluir o novo painel (não remova assertions existentes).

**Verificação manual (obrigatória):** rode `npm run dev`, entre com uma conta SEM acesso de
gasto (ou simule), abra `/`. O painel "Libere seu workspace" deve aparecer no topo. Entre com
uma conta COM acesso e confirme que o painel NÃO aparece.

## Rollback
Delete `app/src/components/billing/AccessGatePanel.tsx`, reverta as duas edições em
`DashboardHomeActions.tsx` (remova o import e a linha `<AccessGatePanel />`) e remova as
chaves `"accessGate"` dos dois arquivos de mensagens.

---
---

# PLANO 2 — Fechar a criação de campanha legada

## Objetivo
Garantir que NENHUM caminho de UI crie uma campanha legada nova. A criação já foi redirecionada
(`campaigns/new` → `/?compose=1`), mas restam: (a) um protótipo dev-only na lista de campanhas,
e (b) o diálogo `AssistantCreateCampaignDialog`, que é o ÚNICO chamador de UI de
`useCreateCampaign` (o hook que faz `POST /api/campaigns`). Ambos estão órfãos. Este plano os
remove.

**IMPORTANTE:** o wizard `/campaigns/[id]` permanece INTACTO. Ele é necessário para campanhas
que já existem. Este plano NÃO deleta o wizard.

## Risco
Baixo. Só deleta código órfão (verificado por grep: nenhum importador em produção).

## Arquivos
- **Modificar:** `app/src/app/(dashboard)/campaigns/page.tsx`
- **Deletar:** `app/src/components/campaigns/WorksRecoveryPrototype.tsx`
- **Deletar:** `app/src/components/prototype/PrototypeSwitcher.tsx`
- **Deletar:** `app/src/components/assistant/AssistantCreateCampaignDialog.tsx`
- **Deletar (se existir):** qualquer arquivo de teste `.test.tsx` dos três componentes acima

## Passo a passo

### Passo 2.1 — Confirmar o estado atual (leitura, sem editar)

Antes de editar, confirme estas premissas rodando (de dentro de `app/src`):

```bash
grep -rn "useCreateCampaign" --include="*.tsx" --include="*.ts" components lib | grep -v ".test."
```

A saída deve mostrar `useCreateCampaign` sendo usado APENAS em
`components/assistant/AssistantCreateCampaignDialog.tsx` (além da definição em
`lib/hooks/use-campaigns.ts`). Se aparecer OUTRO importador de UI que você não esperava,
PARE e não delete o diálogo.

```bash
grep -rln "PrototypeSwitcher" --include="*.tsx" --include="*.ts" . | grep -v ".test."
```

A saída deve listar apenas `PrototypeSwitcher.tsx` e `WorksRecoveryPrototype.tsx`. Se
`PrototypeSwitcher` tiver outro importador, NÃO o delete (delete só o `WorksRecoveryPrototype`).

### Passo 2.2 — Remover o protótipo da lista de campanhas

Abra `app/src/app/(dashboard)/campaigns/page.tsx`.

**2.2.a** — Remova o import (linha ~12):

```tsx
import { WorksRecoveryPrototype } from "@/components/campaigns/WorksRecoveryPrototype";
```

**2.2.b** — Localize a função `CampaignsListContent` (linhas ~60–70). Ela está assim:

```tsx
function CampaignsListContent() {
  const searchParams = useSearchParams();
  const requestedVariant = searchParams.get("variant")?.toUpperCase();
  if (
    process.env.NODE_ENV !== "production" &&
    searchParams.get("prototype") === "works" &&
    (requestedVariant === "A" || requestedVariant === "B" || requestedVariant === "C")
  ) return <WorksRecoveryPrototype variant={requestedVariant} />;

  return <CampaignsProductContent />;
}
```

Substitua a função inteira por:

```tsx
function CampaignsListContent() {
  return <CampaignsProductContent />;
}
```

**2.2.c** — Verifique se `useSearchParams` ainda é usado em algum outro lugar deste arquivo.
Se `CampaignsListContent` era o único uso e agora ficou sem uso, o lint vai apontar import
não usado. Nesse caso, remova `useSearchParams` do import do `next/navigation` no topo APENAS
se nenhum outro trecho do arquivo o utilizar. Se outro trecho usar, mantenha.

### Passo 2.3 — Deletar os arquivos órfãos

Delete estes arquivos (e seus `.test.tsx` correspondentes, se existirem):

```bash
rm app/src/components/campaigns/WorksRecoveryPrototype.tsx
rm app/src/components/prototype/PrototypeSwitcher.tsx
rm app/src/components/assistant/AssistantCreateCampaignDialog.tsx
```

Verifique se há testes e delete-os também:

```bash
ls app/src/components/campaigns/WorksRecoveryPrototype.test.tsx 2>/dev/null && rm app/src/components/campaigns/WorksRecoveryPrototype.test.tsx
ls app/src/components/prototype/PrototypeSwitcher.test.tsx 2>/dev/null && rm app/src/components/prototype/PrototypeSwitcher.test.tsx
ls app/src/components/assistant/AssistantCreateCampaignDialog.test.tsx 2>/dev/null && rm app/src/components/assistant/AssistantCreateCampaignDialog.test.tsx
```

Se o diretório `app/src/components/prototype/` ficar vazio após deletar `PrototypeSwitcher.tsx`,
delete o diretório também: `rmdir app/src/components/prototype 2>/dev/null`.

### Passo 2.4 — Confirmar que nada referencia os arquivos deletados

Rode (de dentro de `app/src`):

```bash
grep -rn "WorksRecoveryPrototype\|PrototypeSwitcher\|AssistantCreateCampaignDialog" --include="*.tsx" --include="*.ts" . 
```

A saída deve ser VAZIA (ou conter apenas referências dentro de arquivos que você acabou de
deletar, que não existirão mais). Se sobrar alguma referência em arquivo vivo, remova-a ou
PARE e investigue.

## O que NÃO mexer
- NÃO delete nem altere `app/src/app/(dashboard)/campaigns/[id]/page.tsx` (o wizard). Ele é
  necessário para campanhas existentes.
- NÃO delete `useCreateCampaign` de `lib/hooks/use-campaigns.ts`. A função de API pode ser
  usada por caminhos de servidor (materialização de template, assistant backend). Só o diálogo
  de UI está sendo removido.
- NÃO altere `app/src/app/(dashboard)/campaigns/new/page.tsx` (o redirect já está correto).
- NÃO toque em `materialize-template-as-campaign.ts` nem em nada de servidor.

## Verificação
De dentro de `app/`:

```bash
npm run typecheck
npm run lint
npm run test
```

Todos devem passar. Se um teste importar um dos componentes deletados, delete ESSE teste
também (ele testava código órfão).

## Rollback
Restaure os arquivos deletados via `git checkout -- <arquivo>` (ou `git restore`). Reverta as
edições em `campaigns/page.tsx` com `git checkout -- app/src/app/(dashboard)/campaigns/page.tsx`.

---
---

# PLANO 3 — Consolidar as entradas de criação em uma porta

## Objetivo
Todas as entradas de criação já funilam para o composer em `/`, mas o botão "+ Nova" do TopBar
dá uma volta desnecessária: aponta para `/campaigns?new=1`, que então redireciona para
`/?compose=1`. Este plano aponta o TopBar DIRETO para `/?compose=1`, eliminando uma perna da
jornada e um estado de URL intermediário.

**Nota de escopo:** este plano é pequeno e cirúrgico. As demais entradas (`campaigns/new`,
CTA da lista, docs, assistant hint, templates) já apontam direto para `/` ou são redirects
legítimos de compatibilidade. Não as altere.

## Risco
Baixo. Muda um único `href`.

## Arquivos
- **Modificar:** `app/src/components/layout/TopBar.tsx`

## Passo a passo

### Passo 3.1 — Localizar o botão "+ Nova"

Abra `app/src/components/layout/TopBar.tsx`. Por volta da linha 288–300 existe este bloco:

```tsx
{isHome && !isShellFloating && (
  <Link
    href="/campaigns?new=1"
    aria-label={tCampaign("new")}
    ...
```

### Passo 3.2 — Mudar o href

Troque APENAS o valor do `href`:

Antes:
```tsx
    href="/campaigns?new=1"
```

Depois:
```tsx
    href="/?compose=1"
```

Não altere mais nenhuma linha deste bloco (classes, aria-label, ícone, etc.).

### Passo 3.3 — Manter o redirect de compatibilidade

NÃO remova o tratamento de `?new=1` em `app/src/components/campaigns/useCampaignsPage.ts`
(linhas ~85–100). Ele permanece como backstop para links externos/antigos que ainda usem
`/campaigns?new=1`. Este plano só muda o TopBar.

## O que NÃO mexer
- NÃO altere `useCampaignsPage.ts`.
- NÃO altere `campaigns/new/page.tsx`.
- NÃO altere nenhum outro `href` do TopBar.
- NÃO remova o botão; apenas mude o destino.

## Verificação
De dentro de `app/`:

```bash
npm run typecheck
npm run lint
npm run test
```

**Verificação manual:** rode `npm run dev`, abra `/`, clique em "+ Nova". A URL deve ir direto
para `/?compose=1` (sem passar por `/campaigns?new=1`).

## Rollback
`git checkout -- app/src/components/layout/TopBar.tsx`.

---
---

# PLANO 4 — Deletar remanescentes órfãos

## Objetivo
Remover código morto que aumenta a superfície cognitiva sem entregar nada:
1. `OnboardingTour.tsx` — nunca é montado (zero importadores).
2. `use-onboarding.ts` + o botão "Restart tour" do `ProfileTab` — reinicia um tour que nunca roda.
3. `MissionPathCard.tsx` e `LaboratoryProgressPanel.tsx` — zero importadores fora testes.
4. `quick-tools/create-post/` — página que é apenas um redirect para `/`.

## Risco
Baixo para os deletes de arquivos órfãos. Médio para a edição no `ProfileTab` (é um formulário
usado). Siga os passos do `ProfileTab` com atenção e verifique o build.

## Arquivos
- **Deletar:** `app/src/components/dashboard/OnboardingTour.tsx`
- **Deletar:** `app/src/lib/hooks/use-onboarding.ts`
- **Modificar:** `app/src/components/settings/ProfileTab.tsx`
- **Deletar:** `app/src/components/dashboard/MissionPathCard.tsx` (+ teste)
- **Deletar:** `app/src/components/dashboard/LaboratoryProgressPanel.tsx` (+ teste)
- **Deletar:** `app/src/app/(dashboard)/quick-tools/create-post/` (diretório inteiro)
- **Modificar:** `app/src/components/layout/AppSidebar.tsx` (ajustar `isHome`)

## Passo a passo

### Passo 4.1 — Confirmar orphanagem (leitura)

De dentro de `app/src`:

```bash
grep -rln "OnboardingTour" --include="*.tsx" --include="*.ts" . | grep -v ".test."
```
Deve listar APENAS `components/dashboard/OnboardingTour.tsx`. Se listar outro importador vivo,
NÃO delete o `OnboardingTour`.

```bash
grep -rln "MissionPathCard\|LaboratoryProgressPanel" --include="*.tsx" --include="*.ts" . | grep -v ".test."
```
Deve listar apenas os próprios arquivos. Se houver importador vivo, NÃO delete o correspondente.

```bash
grep -rln "use-onboarding\|useOnboarding" --include="*.tsx" --include="*.ts" . | grep -v ".test."
```
Deve listar apenas `lib/hooks/use-onboarding.ts` e `components/settings/ProfileTab.tsx`.

### Passo 4.2 — Editar o `ProfileTab.tsx` (remover o bloco "Restart tour")

Abra `app/src/components/settings/ProfileTab.tsx`. Faça estas 4 remoções:

**4.2.a** — Remova o import (linha ~10):
```tsx
import { useOnboarding } from "@/lib/hooks/use-onboarding";
```

**4.2.b** — Remova a chamada do hook (linhas ~144–145):
```tsx
  const { completed: onboardingCompleted, restart, isRestarting } =
    useOnboarding();
```

**4.2.c** — Remova o handler (linhas ~180–183):
```tsx
  const handleRestartTour = () => {
    restart();
    addToast("success", tc("tourRestarted"));
  };
```

**4.2.d** — Remova o bloco JSX condicional (linhas ~245–272). Ele começa em
`{onboardingCompleted && (` e termina no `)}` que fecha o `<m.div>`. Remova o bloco inteiro:

```tsx
          {onboardingCompleted && (
            <m.div
              variants={itemVariants}
              className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-4 sm:px-5"
            >
              <h3 className="text-sm font-medium text-[var(--text-primary)]">
                {t("onboarding.preferences")}
              </h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t("onboarding.restartDescription")}
              </p>
              <button
                type="button"
                onClick={handleRestartTour}
                disabled={isRestarting}
                className={cn(
                  "mt-3 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium",
                  "border border-[var(--border-dim)] bg-[var(--surface-base)] text-[var(--text-primary)]",
                  "hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]",
                  "transition-all duration-200",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <RotateCcw size={14} />
                {isRestarting ? t("onboarding.restarting") : t("onboarding.restartTour")}
              </button>
            </m.div>
          )}
```

**4.2.e** — Após as remoções, verifique se `RotateCcw` (import do `lucide-react`) ainda é usado
em outro lugar do `ProfileTab.tsx`. Se NÃO for, remova `RotateCcw` do import do `lucide-react`
para evitar "unused import". Se ainda for usado, mantenha.

**4.2.f** — As chaves i18n `settings.onboarding.*` (ou onde estiverem) e `common.tourRestarted`
podem ficar sem uso. NÃO as remova dos arquivos de mensagens neste plano (remoção de chave
i18n é arriscada se houver outro uso). Deixe-as; elas são inofensivas.

### Passo 4.3 — Deletar arquivos órfãos

De dentro da raiz do repo:

```bash
rm app/src/components/dashboard/OnboardingTour.tsx
rm app/src/lib/hooks/use-onboarding.ts
rm app/src/components/dashboard/MissionPathCard.tsx
rm app/src/components/dashboard/LaboratoryProgressPanel.tsx
```

Delete os testes correspondentes, se existirem:

```bash
rm -f app/src/components/dashboard/OnboardingTour.test.tsx
rm -f app/src/lib/hooks/use-onboarding.test.ts
rm -f app/src/components/dashboard/MissionPathCard.test.tsx
rm -f app/src/components/dashboard/LaboratoryProgressPanel.test.tsx
```

### Passo 4.4 — Deletar `quick-tools/create-post`

A página `app/src/app/(dashboard)/quick-tools/create-post/page.tsx` é apenas um redirect para
`/`. Delete o diretório inteiro:

```bash
rm -rf "app/src/app/(dashboard)/quick-tools/create-post"
```

Se o diretório `app/src/app/(dashboard)/quick-tools` ficar vazio, delete-o também:
```bash
rmdir "app/src/app/(dashboard)/quick-tools" 2>/dev/null
```

**Atenção:** existe um teste `LegacyCreatePostRedirect.test.tsx` dentro desse diretório; ele
será removido junto. Não há problema — ele testava o redirect deletado.

### Passo 4.5 — Ajustar o `isHome` do `AppSidebar.tsx`

Abra `app/src/components/layout/AppSidebar.tsx`. Por volta da linha 52:

```tsx
  const isHome = pathname === "/" || pathname.startsWith("/quick-tools/create-post");
```

Como `/quick-tools/create-post` não existe mais, simplifique para:

```tsx
  const isHome = pathname === "/";
```

### Passo 4.6 — Confirmar que nada referencia o que foi deletado

De dentro de `app/src`:

```bash
grep -rn "OnboardingTour\|use-onboarding\|useOnboarding\|MissionPathCard\|LaboratoryProgressPanel\|quick-tools/create-post" --include="*.tsx" --include="*.ts" .
```

A saída deve ser VAZIA. Se sobrar referência viva, remova-a ou PARE e investigue.

**Exceção esperada:** `app/src/server/billing` pode classificar geração como
`surface: "quick_tool"` (string de analytics, não rota). Isso NÃO é a rota deletada e deve
permanecer. Não mexa.

## O que NÃO mexer
- NÃO remova chaves i18n dos arquivos de mensagens (risco de quebrar outro uso).
- NÃO altere o `POST /api/user/onboarding` (rota de servidor). Só a UI de tour está sendo
  removida.
- NÃO toque em `AppShell.tsx`, `V6ShellLayout.tsx` ou outro shell.
- NÃO delete `quick-tool-recipes.ts` ainda — ele é importado por
  `components/dashboard/v6/map-dashboard-v6.ts`. Deixe para uma limpeza futura.

## Verificação
De dentro de `app/`:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

O `build` é obrigatório aqui porque deletamos rotas (`quick-tools/create-post`) e o Next.js
valida o roteamento no build.

**Verificação manual:** rode `npm run dev`. Abra `/settings` → aba Profile. O bloco
"Restart tour" não deve mais existir e o restante do perfil deve funcionar (editar nome,
salvar). Navegue para `/quick-tools/create-post` na barra de endereço: deve dar 404 (a rota
não existe mais) — isso é o esperado.

## Rollback
`git checkout -- app/src/components/settings/ProfileTab.tsx app/src/components/layout/AppSidebar.tsx`
e `git restore` (ou `git checkout --`) nos arquivos deletados. Se já tiver feito `rm -rf` no
diretório de rota, use `git checkout -- "app/src/app/(dashboard)/quick-tools"`.

---
---

# PLANO 5 — Unificar o vocabulário visível

## Objetivo
Reduzir a confusão de termos sobrepostos (Campaigns vs Works, Home vs Dashboard/Overview,
etc.) alterando APENAS VALORES de chaves i18n existentes. **Nunca renomear chaves** — renomear
chave quebra toda chamada `t("...")` e é risco alto. Mudar valor é seguro.

Vocabulário canônico (do `CONTEXT.md` na raiz):
- **Início** = superfície operacional (Home). Evitar "Dashboard" como nome visível.
- **Trabalho** = unidade criativa. Evitar "Campanha" como sinônimo de trabalho.
- **Campanha** = agrupamento opcional de Trabalhos.
- **Visão geral** = superfície gerencial secundária.

## Risco
Baixo. Só muda strings. Mas alguns testes podem assertar texto exato; se quebrarem, atualize a
expectativa do teste para o novo valor (não remova a assertion).

## Arquivos
- **Modificar:** `app/messages/en.json`
- **Modificar:** `app/messages/pt-BR.json`

## Passo a passo

### Passo 5.1 — Auditoria (inventário de termos)

Antes de mudar qualquer coisa, gere o inventário de termos duplicados. De dentro de `app/src`:

```bash
grep -rhoE 't(Nav|Campaign|Common)?\("[a-zA-Z.]+"\)' --include="*.tsx" components | sort | uniq -c | sort -rn | head -40
```

E liste as chaves de navegação atuais:

```bash
cd ../ && python3 -c "
import json
d=json.load(open('messages/en.json'))
import sys
def walk(o,p=''):
    if isinstance(o,dict):
        for k,v in o.items(): walk(v,p+'.'+k if p else k)
    else: print(p,'=',o)
walk(d.get('navigation',{}),'navigation')
"
```

Guarde essa saída como referência. Ela mostra o que existe hoje.

### Passo 5.2 — Aplicar as mudanças de VALOR seguras

As mudanças abaixo são apenas de VALOR. Localize cada chave em `en.json` e `pt-BR.json` e
substitua o valor. Não mude o nome da chave.

| Chave | Valor atual (en) | Novo valor (en) | Novo valor (pt-BR) |
|---|---|---|---|
| `navigation.recentCampaigns` | `Recent campaigns` | `Recent work` | `Trabalhos recentes` |
| `navigation.dashboard` | `Overview` | `Overview` | `Visão geral` |

**Justificativa:**
- `navigation.recentCampaigns` e `navigation.recentWorks` ("Recent work") são duplicatas que
  aparecem no mesmo sidebar. Unificar em "Recent work" / "Trabalhos recentes" remove a
  ambiguidade Campanha vs Trabalho. (Verifique no Passo 5.1 qual das duas o
  `SidebarRecentWorks.tsx` realmente usa; se usar `recentWorks`, a `recentCampaigns` pode
  ficar sem uso — mesmo assim, apenas atualize o valor, NÃO delete a chave.)
- `navigation.dashboard` deve refletir "Visão geral" no pt-BR (o nome canônico da superfície
  gerencial), evitando "Dashboard".

**Regra de ouro:** se, ao rodar a auditoria do Passo 5.1, você descobrir que uma chave desta
tabela é usada em um contexto onde o novo valor ficaria semanticamente errado, PULE essa chave
e anote no commit. Não force.

### Passo 5.3 — Verificar uso antes de cada mudança

Para cada chave da tabela, ANTES de mudar, confirme quem usa:

```bash
grep -rn "recentCampaigns" --include="*.tsx" app/src   # ajuste o nome da chave
```

Se a chave for usada em mais de um lugar com significados diferentes, NÃO mude. Pule.

## O que NÃO mexer
- NÃO renomeie NENHUMA chave i18n.
- NÃO delete NENHUMA chave i18n.
- NÃO mude chaves de `campaign.*`, `billing.*`, `assistant.*`, erros, ou qualquer namespace que
  não seja `navigation.*` listado na tabela acima.
- NÃO tente unificar "protocol/intent/toolKind" neste plano — isso é código, não copy, e exige
  refactor próprio (fora de escopo para um passe seguro).

## Verificação
De dentro de `app/`:

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/pt-BR.json','utf8')); console.log('JSON OK')"
npm run typecheck
npm run lint
npm run test
```

Se um teste quebrar por texto exato, atualize a expectativa para o novo valor.

## Rollback
`git checkout -- app/messages/en.json app/messages/pt-BR.json`.

---
---

## Fechamento (após os 5 planos)

Depois de executar os 5 planos, rode o release gate completo para garantir que nada regrediu:

```bash
cd app
npm run typecheck && npm run lint && npm run test && npm run build
```

Faça um smoke manual da jornada curta: signup → criar marca → drop de uma imagem no composer →
Gerar → download. Confirme que:
1. O painel de billing aparece para contas sem acesso (Plano 1).
2. Não há como criar campanha legada nova pela UI (Plano 2).
3. O botão "+ Nova" vai direto para `/?compose=1` (Plano 3).
4. Não há tour de onboarding nem botão "Restart tour" no perfil (Plano 4).
5. Os rótulos de navegação estão consistentes (Plano 5).

**Não executado neste pacote (deliberadamente, por risco):** desligar o wizard
`/campaigns/[id]` para campanhas existentes, unificar `protocol/intent/toolKind` no código,
consolidar `/` vs `/dashboard` em uma única superfície. Esses exigem refactors maiores e
devem ser planejados separadamente depois que estes 5 planos estabilizarem.

---
---

# Registro de Execução (2026-08-18)

Executado na ordem 4 → 2 → 3 → 1 → 5. Resultado por plano e desvios do planejado:

## Plano 4 — Executado com desvio (quick-tools MANTIDO)
- **Deletado:** `OnboardingTour.tsx`, `use-onboarding.ts`, `MissionPathCard.tsx` (+teste),
  `LaboratoryProgressPanel.tsx` (+teste). Removido o bloco "Restart tour" do `ProfileTab.tsx`
  (import, hook, handler e JSX) e o ícone `RotateCcw` que ficou órfão.
- **DESVIO:** a rota `/quick-tools/create-post` **NÃO foi deletada**. A auditoria de execução
  encontrou que ela é um redirect portador de dependência: é usada como `returnPath` por fluxos
  de billing/settlement/copy (`generate-social-post-copy.ts`, `settlement-adapters.ts`,
  `api/creative-work/[id]/copy/route.ts`), e há um diretório `components/quick-tools/` (distinto
  da rota) do qual o `CreativeComposer` importa `CreativeProposalGrid`. Deletar a rota quebraria
  esses return paths. **A rota e o `isHome` do `AppSidebar` foram mantidos como estavam.**
- Impacto: a limpeza de onboarding/missão foi feita; a remoção de quick-tools fica para um plano
  futuro que antes migre os `returnPath` para `/?workId=...` (mexer em settlement = risco alto).

## Plano 2 — Executado conforme planejado
- **Deletado:** `WorksRecoveryPrototype.tsx`, `PrototypeSwitcher.tsx` (diretório `prototype/`
  removido), `AssistantCreateCampaignDialog.tsx` (único chamador de UI de `useCreateCampaign`).
- **Editado:** `campaigns/page.tsx` — removido import e condicional do protótipo;
  `CampaignsListContent` agora retorna direto `<CampaignsProductContent />`.
- O hook `useCreateCampaign` e o wizard `/campaigns/[id]` foram mantidos (conforme planejado).

## Plano 3 — Executado conforme planejado
- `TopBar.tsx`: botão "+ Nova" agora aponta direto para `/?compose=1` (antes `/campaigns?new=1`).
- O redirect de compatibilidade `?new=1` em `useCampaignsPage.ts` foi mantido como backstop.

## Plano 1 — Executado conforme planejado
- **Criado:** `components/billing/AccessGatePanel.tsx` + teste `AccessGatePanel.test.tsx` (4 casos).
- **Editado:** `DashboardHomeActions.tsx` (import + `<AccessGatePanel />` no topo do return).
- **i18n:** adicionado `billing.accessGate` em `en.json` e `pt-BR.json`.
- **Ajuste de teste:** `DashboardHomeActions.test.tsx` ganhou mock de `@/lib/hooks/use-billing`
  (usuário COM acesso → painel não renderiza), necessário porque o componente novo consome
  `useBillingStatus`.

## Plano 5 — Nenhuma alteração necessária (auditoria)
A auditoria de execução mostrou que o vocabulário visível **já está canônico**:
- `navigation.dashboard` já é "Visão geral" (pt-BR) / "Overview" (en).
- O sidebar já usa `navigation.works` ("Trabalhos"), `navigation.home` ("Início"),
  `navigation.recentWorks` ("Trabalhos recentes").
- `navigation.campaigns` ("Campanhas") e `navigation.recentCampaigns` ("Campanhas recentes") são
  chaves i18n **órfãs** (nenhum componente as renderiza); mudá-las não teria efeito visível.
- Não há string "Dashboard" exposta na UI (só nomes internos de tipo/componente).

Como o plano era mudar apenas VALORES com impacto visível, e não havia mudança segura/útil a
fazer, **nada foi alterado**. Unificar `protocol/intent/toolKind` permanece fora de escopo
(é código, não copy).

## Verificação final (evidência)
Executado de dentro de `app/`:
- `npm run typecheck` → limpo.
- `npm run lint` → 0 erros (114 warnings pré-existentes, nenhum introduzido).
- `npm run test` → **685 arquivos / 4961 testes passaram**, 14 skipped (integração que exige DB,
  já skipados antes). Inclui os 4 testes novos do `AccessGatePanel`.
- `npm run build` → sucesso; lista de rotas íntegra (incluindo `/quick-tools/create-post` mantida).

## Resumo das mudanças por arquivo
| Arquivo | Ação |
|---|---|
| `components/billing/AccessGatePanel.tsx` | Criado |
| `components/billing/AccessGatePanel.test.tsx` | Criado |
| `components/dashboard/DashboardHomeActions.tsx` | Editado (import + painel) |
| `components/dashboard/DashboardHomeActions.test.tsx` | Editado (mock use-billing) |
| `messages/en.json`, `messages/pt-BR.json` | Editado (`billing.accessGate`) |
| `components/layout/TopBar.tsx` | Editado (href "+ Nova") |
| `app/(dashboard)/campaigns/page.tsx` | Editado (remove protótipo) |
| `components/settings/ProfileTab.tsx` | Editado (remove Restart tour) |
| `components/layout/AppSidebar.tsx` | Inalterado (revertido; quick-tools mantido) |
| `OnboardingTour.tsx`, `use-onboarding.ts`, `MissionPathCard.tsx`, `LaboratoryProgressPanel.tsx`, `WorksRecoveryPrototype.tsx`, `PrototypeSwitcher.tsx`, `AssistantCreateCampaignDialog.tsx` (+testes) | Deletados |
