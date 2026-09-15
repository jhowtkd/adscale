import { inngest } from "./client";
import { logger } from "@/lib/logger";
import { syncAllConnections, syncConnection } from "@/server/served-ads/sync";

/**
 * Sync Anúncios veiculados (#347): cron 6h em todas as conexões ativas
 * + evento para "atualizar agora" e pós-OAuth. TTL 90 dias roda junto.
 */
export const metaAdsSyncJob = inngest.createFunction(
  {
    id: "meta-ads-sync",
    triggers: [{ cron: "0 */6 * * *" }, { event: "meta.ads.sync" }],
    retries: 2,
    onFailure: async ({ error }) => {
      logger.error("[metaAdsSyncJob] failed after retries", { error });
    },
  },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as { connectionId?: string };
    if (event.name === "meta.ads.sync" && data.connectionId) {
      const result = await step.run("sync-connection", () => syncConnection(data.connectionId as string));
      logger.info("[metaAdsSyncJob] conexão sincronizada", result);
      return;
    }
    const result = await step.run("sync-all-connections", () => syncAllConnections());
    logger.info("[metaAdsSyncJob] cron 6h concluído", result);
  }
);
