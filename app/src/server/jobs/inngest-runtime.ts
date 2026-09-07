import type { ClientOptions } from "inngest";

/**
 * CI e2e (`next start` + local Inngest) cannot set `INNGEST_DEV`: Next bakes
 * that var empty in production builds, and the client refuses it in production.
 * Point send() at the Dev Server only when the controlled-provider double is on.
 * Never set `E2E_CONTROLLED_PROVIDER` on Render.
 */
export function inngestLocalDispatchOptions(
  source: NodeJS.ProcessEnv = process.env,
): Pick<ClientOptions, "baseUrl" | "isDev"> {
  const baseUrl = source.INNGEST_BASE_URL?.trim();
  if (source.E2E_CONTROLLED_PROVIDER === "true" && baseUrl) {
    return { baseUrl, isDev: true };
  }
  return {};
}
