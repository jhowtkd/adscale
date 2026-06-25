import type { ActionContract } from "./types";

export const ACTION_CONTRACT_REGISTRY: Record<string, ActionContract> = {};

export function registerActionContract(contract: ActionContract): void {
  ACTION_CONTRACT_REGISTRY[contract.actionType] = contract;
}

export function getActionContract(
  actionType: string
): ActionContract | undefined {
  return ACTION_CONTRACT_REGISTRY[actionType];
}
