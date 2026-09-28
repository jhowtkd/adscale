// Read projections over the repositories: account state and goals view.
// Plain reads, no transactions, no domain decisions.

import type {
  EquipeFront,
  EquipeMandate,
  EquipeOnboardingStep,
  EquipeOnboardingStepKey,
  EquipePlan,
  EquipeRepositories,
} from "../data";

export const ONBOARDING_STEP_ORDER: EquipeOnboardingStepKey[] = [
  "scope_confirm",
  "materials",
  "context",
  "plan",
  "mandate",
  "connection",
  "go_live",
];

function byStepOrder(a: EquipeOnboardingStep, b: EquipeOnboardingStep): number {
  // Stored steps are validated against the same enum on write.
  const rank = (step: string): number => ONBOARDING_STEP_ORDER.indexOf(step as EquipeOnboardingStepKey);
  return rank(a.step) - rank(b.step);
}

export type AccountStateView = {
  workspaceId: string;
  accountId: string;
  status: string;
  fronts: EquipeFront[];
  /** Steps still open (pending, in progress, or paused), in flow order. */
  pendingSteps: EquipeOnboardingStep[];
};

export async function getAccountState(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
): Promise<AccountStateView | null> {
  const account = await repos.accounts.get(workspaceId, accountId);
  if (!account) return null;
  const scope = { workspaceId, accountId };
  const fronts = (await repos.fronts.list(scope)).sort((a, b) => a.key.localeCompare(b.key));
  const pendingSteps = (await repos.onboarding.list(scope))
    .filter((step) => step.status === "pending" || step.status === "in_progress" || step.status === "paused")
    .sort(byStepOrder);
  return { workspaceId, accountId, status: account.status, fronts, pendingSteps };
}

export type GoalsView = {
  workspaceId: string;
  accountId: string;
  /** Latest approved plan, else the latest proposal, else null. */
  plan: EquipePlan | null;
  mandates: EquipeMandate[];
  onboarding: EquipeOnboardingStep[];
};

function latestByVersion<T extends { version: number }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || row.version > best.version) best = row;
  }
  return best;
}

export async function getGoalsView(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
): Promise<GoalsView | null> {
  const account = await repos.accounts.get(workspaceId, accountId);
  if (!account) return null;
  const scope = { workspaceId, accountId };
  const plans = await repos.plans.list(scope);
  const plan =
    latestByVersion(plans.filter((p) => p.status === "approved")) ??
    latestByVersion(plans.filter((p) => p.status === "proposed")) ??
    null;
  const mandates = (await repos.mandates.list(scope)).sort((a, b) => a.version - b.version);
  const onboarding = (await repos.onboarding.list(scope)).sort(byStepOrder);
  return { workspaceId, accountId, plan, mandates, onboarding };
}
