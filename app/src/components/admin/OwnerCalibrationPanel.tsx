"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import ResponsiveTabs from "@/components/layout/ResponsiveTabs";
import { LearningProposalsTab } from "@/components/feedback/LearningProposalsTab";
import { BrandVoiceInspectPanel } from "./BrandVoiceInspectPanel";
import { BrandTasteProfilePanel, fetchBrandTasteProfile } from "./BrandTasteProfilePanel";
import { BrandCalibrationRulesPanel } from "./BrandCalibrationRulesPanel";

type BrandListItem = {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
};

async function fetchBrandList(): Promise<BrandListItem[] | "forbidden"> {
  const res = await apiFetch("/api/admin/quality/brands");
  if (res.status === 403) return "forbidden";
  if (!res.ok) throw new Error("failed");
  const data = (await res.json()) as { brands: BrandListItem[] };
  return data.brands;
}

const TAB_ITEMS = [
  { id: "profile", label: "Perfil" },
  { id: "voice", label: "Voz" },
  { id: "rules", label: "Regras" },
  { id: "proposals", label: "Propostas" },
] as const;

type TabId = (typeof TAB_ITEMS)[number]["id"];

export function OwnerCalibrationPanel({
  clientProfileId,
  onBrandChange,
}: {
  clientProfileId: string;
  onBrandChange?: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  const brandsQuery = useQuery({
    queryKey: ["owner-brand-list"],
    queryFn: fetchBrandList,
    retry: false,
  });

  const profileGateQuery = useQuery({
    queryKey: ["brand-taste-profile", clientProfileId],
    queryFn: () => fetchBrandTasteProfile(clientProfileId),
    retry: false,
  });

  if (profileGateQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Carregando painel de calibração…</p>;
  }

  if (profileGateQuery.data === "forbidden") {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Painel restrito a proprietários da plataforma.
      </p>
    );
  }

  const brands = brandsQuery.data === "forbidden" ? [] : (brandsQuery.data ?? []);
  const selectedBrand = brands.find((brand) => brand.id === clientProfileId);
  const workspaceId = selectedBrand?.workspaceId ?? profileGateQuery.data?.workspaceId;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label
          htmlFor="owner-brand-selector"
          className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
        >
          Selecionar marca
        </label>
        <select
          id="owner-brand-selector"
          className="w-full max-w-md rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
          value={clientProfileId}
          disabled={brandsQuery.isLoading || brands.length === 0}
          onChange={(event) => {
            const nextId = event.target.value;
            if (nextId && nextId !== clientProfileId) {
              onBrandChange?.(nextId);
            }
          }}
        >
          {brandsQuery.isLoading ? (
            <option value={clientProfileId}>Carregando marcas…</option>
          ) : brands.length === 0 ? (
            <option value={clientProfileId}>Nenhuma marca disponível</option>
          ) : (
            brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name} ({brand.workspaceName})
              </option>
            ))
          )}
        </select>
      </div>

      <ResponsiveTabs
        ariaLabel="Calibração da marca"
        items={TAB_ITEMS.map((tab) => ({
          ...tab,
          label: (
            <span role="tab" aria-selected={activeTab === tab.id}>
              {tab.label}
            </span>
          ),
        }))}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as TabId)}
      />

      <div className="pt-2">
        {activeTab === "profile" ? (
          <BrandTasteProfilePanel clientProfileId={clientProfileId} />
        ) : null}
        {activeTab === "voice" ? (
          <BrandVoiceInspectPanel clientProfileId={clientProfileId} />
        ) : null}
        {activeTab === "rules" ? (
          <BrandCalibrationRulesPanel clientProfileId={clientProfileId} />
        ) : null}
        {activeTab === "proposals" ? (
          <LearningProposalsTab
            workspaceId={workspaceId}
            clientProfileId={clientProfileId}
            variant="brand"
            onOpenCalibration={() => setActiveTab("rules")}
          />
        ) : null}
      </div>
    </div>
  );
}
