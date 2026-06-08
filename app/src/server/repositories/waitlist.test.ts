import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: { insert: vi.fn(), select: vi.fn() },
}));

import { db } from "@/server/db";
import { createWaitlistSignup } from "./waitlist";

describe("waitlist repository", () => {
  it("creates signup with normalized email", async () => {
    const row = { id: "w1", email: "a@b.com" };
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });

    const result = await createWaitlistSignup({
      name: "Ana",
      email: "a@b.com",
      sector: "saas",
      sectorOther: null,
      whatsapp: "5511999999999",
      consentAt: new Date(),
      consentVersion: "2026-06-08",
      locale: "pt-BR",
    });

    expect(result).toEqual(row);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ email: "a@b.com" }));
  });
});
