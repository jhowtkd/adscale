import { describe, expect, it } from "vitest";
import { inngestLocalDispatchOptions } from "./inngest-runtime";

describe("inngestLocalDispatchOptions", () => {
  it("does not enable local dispatch in production without the e2e double", () => {
    expect(inngestLocalDispatchOptions({
      NODE_ENV: "production",
      INNGEST_BASE_URL: "http://127.0.0.1:8288",
    })).toEqual({});
  });

  it("does not enable local dispatch when the e2e double has no Dev Server URL", () => {
    expect(inngestLocalDispatchOptions({
      E2E_CONTROLLED_PROVIDER: "true",
    })).toEqual({});
  });

  it("points send() at the local Dev Server for controlled-provider CI", () => {
    expect(inngestLocalDispatchOptions({
      NODE_ENV: "production",
      E2E_CONTROLLED_PROVIDER: "true",
      INNGEST_BASE_URL: "http://127.0.0.1:8288",
    })).toEqual({
      baseUrl: "http://127.0.0.1:8288",
      isDev: true,
    });
  });
});
