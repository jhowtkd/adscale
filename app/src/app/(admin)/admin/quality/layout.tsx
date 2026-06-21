"use client";

import { Suspense } from "react";
import PageFrame from "@/components/layout/PageFrame";
import { QualityProvider } from "@/components/admin/quality/quality-context";
import QualityScopeHeader from "@/components/admin/quality/QualityScopeHeader";

export default function AdminQualityLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <Suspense fallback={null}>
        <QualityProvider>
          <QualityScopeHeader showCohortFilter />
          {children}
        </QualityProvider>
      </Suspense>
    </PageFrame>
  );
}
