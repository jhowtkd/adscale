import { type Page } from "@playwright/test";

/**
 * Spec 2026-10-07 §2: the Studio composer lives at /creative-work/new (`/` is the conversation), so a spec that drives
 * it goes there directly. `query` is the composer query (`?workId=…&intent=…`), as the home used to read it.
 */
export async function gotoComposer(
  page: Page,
  query = "",
  options?: Parameters<Page["goto"]>[1],
): Promise<void> {
  await page.goto(`/creative-work/new${query}`, options);
}
