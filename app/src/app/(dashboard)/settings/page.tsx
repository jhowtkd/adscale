"use client";

import { Suspense, useEffect, useMemo } from "react";
import { m } from "@/components/animations/MotionBoundary";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import ProfileTab from "@/components/settings/ProfileTab";
import SettingsTabSkeleton from "@/components/settings/SettingsTabSkeleton";
import SettingsV6View from "@/components/settings/v6/SettingsV6View";
import { buildSettingsV6Labels } from "@/components/settings/v6/build-settings-v6-labels";
import { mapSettingsToV6Cards } from "@/components/settings/v6/map-settings-v6";
import { useTranslations } from "next-intl";
import { isLegacyBrandSettingsTab, resolveSettingsTab } from "./settings-tabs";

const WorkspaceTab = dynamic(() => import("@/components/settings/WorkspaceTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const TeamTab = dynamic(() => import("@/components/settings/TeamTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const BillingTab = dynamic(() => import("@/components/settings/BillingTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const CreditHistoryTab = dynamic(() => import("@/components/settings/CreditHistoryTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const PlansTab = dynamic(() => import("@/components/settings/PlansTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const IntegrationsTab = dynamic(() => import("@/components/settings/IntegrationsTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const PrivacyTab = dynamic(() => import("@/components/settings/PrivacyTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const tabVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsTabSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("settings");
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    if (!isLegacyBrandSettingsTab(requestedTab)) return;
    const clientProfileId = searchParams.get("clientProfileId");
    const params = new URLSearchParams();
    if (requestedTab === "brandTraining") params.set("mode", "training");
    if (clientProfileId) params.set("clientProfileId", clientProfileId);
    const qs = params.toString();
    router.replace(qs ? `/brand-kit?${qs}` : "/brand-kit");
  }, [requestedTab, searchParams, router]);

  const activeTab = resolveSettingsTab(requestedTab);

  const labels = useMemo(() => buildSettingsV6Labels(t), [t]);
  const cards = useMemo(() => mapSettingsToV6Cards({ t }), [t]);

  if (isLegacyBrandSettingsTab(requestedTab)) {
    return <SettingsTabSkeleton />;
  }

  const panel = (
    <m.div key={activeTab} variants={tabVariants} initial="hidden" animate="visible">
      {activeTab === "profile" && <ProfileTab />}
      {activeTab === "workspace" && <WorkspaceTab />}
      {activeTab === "team" && <TeamTab />}
      {activeTab === "billing" && <BillingTab />}
      {activeTab === "creditHistory" && <CreditHistoryTab />}
      {activeTab === "plans" && <PlansTab />}
      {activeTab === "integrations" && <IntegrationsTab />}
      {activeTab === "privacy" && <PrivacyTab />}
    </m.div>
  );

  return (
    <div className="pb-10">
      <SettingsV6View
        labels={labels}
        cards={cards}
        activeCardId={activeTab}
        onSelectCard={(id) => router.replace(`/settings?tab=${id}`, { scroll: false })}
        panel={panel}
      />
    </div>
  );
}
