// equipe-agent-work: event trigger plus per-account concurrency.

import { describe, expect, it } from "vitest";
import {
  EQUIPE_AGENT_WORK_EVENT,
  EQUIPE_AGENT_WORK_ID,
  equipeAgentWorkJob,
} from "./agent-work";

describe("equipeAgentWorkJob", () => {
  it("triggers on the agent work event with concurrency 1 per account", () => {
    expect(EQUIPE_AGENT_WORK_ID).toBe("equipe-agent-work");
    expect(EQUIPE_AGENT_WORK_EVENT).toBe("equipe.agent.work");
    const opts = (
      equipeAgentWorkJob as unknown as {
        opts: {
          id?: string;
          retries?: number;
          concurrency?: Array<{ limit: number; key?: string }>;
          triggers?: Array<{ event?: string }>;
        };
      }
    ).opts;
    expect(opts.id).toBe("equipe-agent-work");
    expect(opts.concurrency).toEqual([{ limit: 1, key: "event.data.accountId" }]);
    expect(opts.triggers).toEqual([{ event: "equipe.agent.work" }]);
  });
});
