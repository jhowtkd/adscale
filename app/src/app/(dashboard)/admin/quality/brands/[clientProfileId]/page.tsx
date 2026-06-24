"use client";

import { useParams } from "next/navigation";
import { BrandVoiceInspectPanel } from "@/components/admin/BrandVoiceInspectPanel";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import Panel from "@/components/layout/Panel";

export default function BrandVoiceInspectPage() {
  const params = useParams<{ clientProfileId: string }>();
  const clientProfileId = params.clientProfileId;

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader
        title="Voz da marca"
        description="Inspeção read-only da configuração editorial Olhar por perfil de cliente."
      />
      <Panel padding="md">
        <BrandVoiceInspectPanel clientProfileId={clientProfileId} />
      </Panel>
    </PageFrame>
  );
}
