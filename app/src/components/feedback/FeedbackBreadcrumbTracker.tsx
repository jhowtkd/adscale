"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pushFeedbackBreadcrumb } from "@/lib/feedback/breadcrumb-store";

export default function FeedbackBreadcrumbTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams?.toString();
    pushFeedbackBreadcrumb({
      type: "navigation",
      detail: query ? `${pathname}?${query}` : pathname,
    });
  }, [pathname, searchParams]);

  return null;
}
