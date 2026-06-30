import AuthCard from "@/components/auth/AuthCard";
import AuthV6BrandingPanel from "@/components/auth/v6/AuthV6BrandingPanel";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import { previewAuthBranding, previewAuthLabels } from "./preview-login-fixtures";

export default function LoginPreviewPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Mockup 14</p>
        <h1 className="product-page-title text-[var(--text-primary)]">Login / Acesso</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Tela de entrada com painel de marca à esquerda e formulário v6 à direita.
        </p>
      </header>

      <div className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--canvas)]">
        <div className="relative flex flex-col gap-6 p-4 lg:flex-row lg:items-stretch lg:p-6">
          <div className="pointer-events-none absolute inset-0 dot-grid opacity-30" aria-hidden />
          <AuthV6BrandingPanel labels={previewAuthBranding} />
          <div className="relative z-10 flex flex-1 items-center justify-center py-4">
            <AuthCard>
              <div className="space-y-6">
                <AuthV6Header
                  sectionLabel={previewAuthLabels.accessLabel}
                  title={previewAuthLabels.welcomeBack}
                  subtitle={previewAuthLabels.signInSubtitle}
                />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm text-[var(--text-primary)]">{previewAuthLabels.email}</label>
                    <div className="h-10 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
                      {previewAuthLabels.emailPlaceholder}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-[var(--text-primary)]">{previewAuthLabels.password}</label>
                    <div className="h-10 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]">
                      ••••••••
                    </div>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-[var(--radius-control)] bg-[var(--accent-primary)] py-2.5 text-sm font-medium text-[var(--text-on-accent)]"
                  >
                    {previewAuthLabels.signIn}
                  </button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[var(--border-subtle)]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[var(--surface-base)] px-2 text-[var(--text-secondary)]">
                      {previewAuthLabels.orContinueWith}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)]">
                    Google
                  </div>
                  <div className="flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)]">
                    GitHub
                  </div>
                </div>
              </div>
            </AuthCard>
          </div>
        </div>
      </div>
    </div>
  );
}
