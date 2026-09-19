import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { VISUAL_PASSWORD } from "./visual-auth";

export const NO_BRAND_EMAIL = "guest-no-brand@example.test";
export const NO_BRAND_PASSWORD = process.env.GUEST_NO_BRAND_PASSWORD ?? "GuestNoBrand123!";

export function seedNoBrandUser(): void {
  execFileSync("npx", ["tsx", "scripts/seed-guest-no-brand.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      NODE_OPTIONS: `--conditions=react-server ${process.env.NODE_OPTIONS ?? ""}`.trim(),
    },
    stdio: "inherit",
  });
}

export const GUEST_DB = { name: "adscale-public-drafts-v1", version: 2 };

export type GuestDraftSnapshot = {
  id: string;
  request: string;
  intent: string;
  exampleId: string | null;
  files: { name: string; size: number; type: string }[];
  createdAt: number;
  expiresAt: number;
};

/** Read-only native IndexedDB access, for assertions only. */
export async function readGuestDraft(
  page: Page,
  id: string
): Promise<GuestDraftSnapshot | null> {
  return page.evaluate(
    ({ dbName, version, draftId }) =>
      new Promise<GuestDraftSnapshot | null>((resolve, reject) => {
        const open = indexedDB.open(dbName, version);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("drafts", "readonly");
          const get = tx.objectStore("drafts").get(draftId);
          get.onerror = () => {
            db.close();
            reject(get.error);
          };
          get.onsuccess = () => {
            db.close();
            resolve((get.result as GuestDraftSnapshot | undefined) ?? null);
          };
        };
      }),
    { dbName: GUEST_DB.name, version: GUEST_DB.version, draftId: id }
  );
}

export function guestDraftIdFromUrl(url: string): string | null {
  const params = new URL(url).searchParams;
  const direct = params.get("guestDraft");
  const nested = params.get("callbackUrl")
    ? new URL(params.get("callbackUrl")!, "https://callback.invalid").searchParams.get("guestDraft")
    : null;
  const value = direct ?? nested;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
}

/** Sign in from the current login page without dropping its callbackUrl. */
export async function loginOnCurrentPage(
  page: Page,
  email: string,
  password: string = VISUAL_PASSWORD
): Promise<void> {
  await page.locator("#email:visible").fill(email);
  await page.locator("#login-password:visible").fill(password);
  const signInResponse = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email")
  );
  await page.locator("form:has(#email:visible) button[type=submit]").click();
  const response = await signInResponse;
  expect(response.ok()).toBe(true);
}

export async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: /^Aceitar todos$|^Accept all$/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}
