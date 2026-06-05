export type FeedbackBreadcrumb = {
  type: "navigation" | "ui" | "fetch" | "error";
  at: string;
  detail?: string;
  status?: number;
};

const MAX_BREADCRUMBS = 20;

let breadcrumbs: FeedbackBreadcrumb[] = [];

export function pushFeedbackBreadcrumb(entry: Omit<FeedbackBreadcrumb, "at">) {
  breadcrumbs = [
    ...breadcrumbs.slice(-(MAX_BREADCRUMBS - 1)),
    { ...entry, at: new Date().toISOString() },
  ];
}

export function getFeedbackBreadcrumbs(): FeedbackBreadcrumb[] {
  return [...breadcrumbs];
}

export function clearFeedbackBreadcrumbs() {
  breadcrumbs = [];
}
