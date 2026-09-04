"use client";

import { useParams, useRouter } from "next/navigation";
import { OwnerCalibrationPanel } from "@/components/admin/OwnerCalibrationPanel";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";

export default function BrandCalibrationPage() {
  const params = useParams<{ clientProfileId: string }>();
  const router = useRouter();
  const clientProfileId = params.clientProfileId;

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader
        title="Calibração da marca"
        description="Governança de gosto por marca: perfil de evidência, voz editorial e regras aprovadas."
      />
      <OwnerCalibrationPanel
          clientProfileId={clientProfileId}
          onBrandChange={(id) => router.push(`/admin/quality/brands/${id}`)}
        />
    </PageFrame>
  );
}
