"use client";

import Image from "next/image";
import { useDashboardStats } from "@/lib/hooks/use-dashboard-stats";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Search, Plus, LayoutGrid, List, Zap } from "lucide-react";
import VisualCampaignCard from "@/components/dashboard/VisualCampaignCard";
import CreditPanel from "@/components/dashboard/CreditPanel";

const CreditChart = dynamic(() => import("@/components/dashboard/CreditChart"), {
  loading: () => <div className="h-[300px] w-full bg-[var(--surface-raised)] rounded-xl animate-pulse border-2 border-[var(--border-dim)]" />,
});

const ActivityFeed = dynamic(() => import("@/components/dashboard/ActivityFeed"), {
  loading: () => <div className="h-[200px] w-full bg-[var(--surface-raised)] rounded-xl animate-pulse border-2 border-[var(--border-dim)]" />,
});

const OnboardingTour = dynamic(
  () => import("@/components/dashboard/OnboardingTour").then((mod) => mod.OnboardingTour),
  {
    loading: () => null,
    ssr: false,
  }
);

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tOnboarding = useTranslations("onboarding");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const { data: stats, isLoading, error } = useDashboardStats(period);

  const { completed: onboardingCompleted, isLoading: isOnboardingLoading, complete: completeOnboarding } = useOnboarding();

  const tourSteps = [
    {
      target: '[data-tour-step="1"]',
      title: tOnboarding("step1Title"),
      description: tOnboarding("step1Desc"),
      placement: "bottom" as const,
    },
    {
      target: '[data-tour-step="2"]',
      title: tOnboarding("step2Title"),
      description: tOnboarding("step2Desc"),
      placement: "bottom" as const,
    },
    {
      target: '[data-tour-step="3"]',
      title: tOnboarding("step3Title"),
      description: tOnboarding("step3Desc"),
      placement: "top" as const,
    },
    {
      target: '[data-tour-step="4"]',
      title: tOnboarding("step4Title"),
      description: tOnboarding("step4Desc"),
      placement: "bottom" as const,
    },
    {
      target: '[data-tour-step="5"]',
      title: tOnboarding("step5Title"),
      description: tOnboarding("step5Desc"),
      placement: "left" as const,
    },
  ];

  const showTour = !isOnboardingLoading && !onboardingCompleted;

  const filteredCampaigns = stats?.recentCampaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    return <DashboardError />;
  }

  return (
    <main className="w-full">
      {/* Bold Header Section */}
      <section className="relative border-b-2 border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden">
        {/* Subtle grid pattern background */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 232, 94, 0.3) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(0, 232, 94, 0.3) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
        
        <div className="relative max-w-[1600px] mx-auto px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6" data-tour-step="1">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Zap size={24} className="text-[var(--accent-green)]" />
                <h1 
                  className="text-3xl md:text-4xl font-black text-[var(--text-primary)] tracking-tight"
                  style={{ fontFamily: 'var(--font-heading)', lineHeight: 1.2 }}
                >
                  Campanhas
                </h1>
              </div>
              <p className="text-sm font-medium text-[var(--text-muted)] pl-10">
                <span className="text-[var(--accent-green)] font-bold">{stats.totalCampaigns}</span> campanhas ativas ·{" "}
                <span className="text-[var(--accent-green)] font-bold">{stats.derivationsThisMonth}</span> derivações este mês
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
	                <input
	                  type="text"
	                  aria-label="Buscar campanhas"
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 pl-9 pr-4 bg-[var(--deep-bg)] border-2 border-[var(--border-dim)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-green)]/50 focus:ring-2 focus:ring-[var(--accent-green)]/20 w-[220px] transition-all font-medium"
                />
              </div>

              <fieldset className="flex items-center bg-[var(--deep-bg)] border-2 border-[var(--border-dim)] rounded-xl p-1" aria-label="Visualização">
                <button type="button"
                  onClick={() => setViewMode("grid")}
                  className={`p-2.5 rounded-lg transition-all ${
                    viewMode === "grid"
                      ? "bg-[var(--surface-raised)] text-[var(--accent-green)] shadow-[0_0_12px_var(--accent-green-dim)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                  aria-label="Visualização em grade"
                  aria-pressed={viewMode === "grid"}
                >
                  <LayoutGrid size={18} aria-hidden="true" />
                </button>
                <button type="button"
                  onClick={() => setViewMode("list")}
                  className={`p-2.5 rounded-lg transition-all ${
                    viewMode === "list"
                      ? "bg-[var(--surface-raised)] text-[var(--accent-green)] shadow-[0_0_12px_var(--accent-green-dim)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                  aria-label="Visualização em lista"
                  aria-pressed={viewMode === "list"}
                >
                  <List size={18} aria-hidden="true" />
                </button>
              </fieldset>
            </div>
          </div>
        </div>
      </section>

      {/* Campaigns Grid Section */}
      <section className="py-10" style={{ contentVisibility: "auto" }}>
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8" data-tour-step="2">
          {filteredCampaigns.length > 0 ? (
            <div 
              className="grid gap-5"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                containIntrinsicHeight: "350px"
              }}
            >
              {filteredCampaigns.map((campaign, index) => (
                <VisualCampaignCard
                  key={campaign.id}
                  id={campaign.id}
                  name={campaign.name}
                  thumbnailUrl={campaign.thumbnailUrl}
                  pieceCount={campaign.pieceCount}
                  approvedCount={campaign.approvedCount}
                  status={campaign.status}
                  updatedAt={campaign.updatedAt.toString()}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <EmptyState searchQuery={searchQuery} />
          )}
        </div>
      </section>

      {/* Bold Stats Section */}
      <section className="border-t-2 border-[var(--border-dim)] bg-[var(--surface-base)] relative overflow-hidden">
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, var(--accent-green) 1px, transparent 1px)`,
            backgroundSize: '30px 30px'
          }}
        />
        
        <div className="relative max-w-[1600px] mx-auto px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
            <div className="space-y-8">
              <CreditChart data={stats.creditUsageSeries} />
            </div>
            <div className="space-y-8">
              <div data-tour-step="5">
                <CreditPanel
                  remaining={stats.creditsRemaining}
                  total={stats.creditsTotal}
                  planKey={stats.subscription.planKey}
                />
              </div>
              <ActivityFeed activities={stats.recentActivity.map((a) => ({ ...a, createdAt: a.createdAt.toString() }))} />
            </div>
          </div>
        </div>
      </section>

      {showTour && (
        <OnboardingTour
          steps={tourSteps}
          onComplete={completeOnboarding}
          onSkip={completeOnboarding}
        />
      )}
    </main>
  );
}

function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="mb-6">
        <Image src="/images/empty-state.svg" alt="Nenhuma campanha" className="size-48 object-contain" 
        width={800}
        height={800}
        unoptimized
      />
      </div>
      <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
        {searchQuery ? "Nenhuma campanha encontrada" : "Nenhuma campanha ainda"}
      </h2>
      <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md text-center font-medium">
        {searchQuery 
          ? "Tente ajustar sua busca ou filtros"
          : "Crie sua primeira campanha para começar a gerar criativos com IA"
        }
      </p>
      {!searchQuery && (
        <Link
          href="/campaigns/new"
          className="mt-8 flex items-center gap-2 px-6 py-3 text-sm font-bold text-[var(--deep-bg)] bg-[var(--accent-green)] rounded-xl hover:bg-[var(--accent-green-light)] transition-all hover:shadow-[0_0_20px_var(--accent-green-dim)] hover:scale-105"
        >
          <Plus size={16} strokeWidth={3} aria-hidden="true" />
          Criar Campanha
        </Link>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="w-full">
      <section className="border-b border-[var(--border-dim)] glass-card">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-8">
          <div className="h-10 bg-[var(--surface-raised)] rounded-xl w-64 mb-3" />
          <div className="h-5 bg-[var(--surface-raised)] rounded-lg w-96" />
        </div>
      </section>
      <section className="py-10">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8">
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div 
                key={i} 
                className="aspect-[4/3] glass-card rounded-2xl animate-pulse" 
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function DashboardError() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="size-24 rounded-2xl bg-[var(--surface-raised)] border-[3px] border-[var(--accent-rose)]/30 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(225,29,72,0.15)]">
        <span className="text-4xl text-[var(--accent-rose)] font-black">!</span>
      </div>
      <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
        Erro ao carregar
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-6">Erro ao carregar dashboard</p>
      <button type="button"
        onClick={() => window.location.reload()}
        className="px-6 py-3 text-sm font-bold text-[var(--ink)] bg-[var(--accent-green)] rounded-xl hover:bg-[var(--accent-green-light)] transition-all hover:shadow-[0_0_30px_var(--accent-green-dim)]"
      >
        Tentar novamente
      </button>
    </div>
  );
}
