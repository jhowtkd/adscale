import { inngest } from "@/server/jobs/client";
import { createProdJobDeps, moduleDepsFor } from "./shared";
import type { JobStep } from "./shared";
import { createHandoffReadHandler } from "../handoff/read";
import { createHandoffReaders } from "../handoff/readers";
import { HANDOFF_READ_EVENT } from "../handoff/contract";
const deps = createProdJobDeps();
export const equipeHandoffReadJob = inngest.createFunction({
  id: "equipe-handoff-read", triggers: [{ event: HANDOFF_READ_EVENT }], retries: 1,
  concurrency: [{ limit: 1, key: "event.data.accountId" }],
}, async ({ event, step }) => createHandoffReadHandler(moduleDepsFor(deps, String(event.data.workspaceId)), createHandoffReaders())({ event, step: step as unknown as JobStep }));
