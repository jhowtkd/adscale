import { expect, test } from "@playwright/test";
import { ensureIdentity, loginAs, withDb } from "./support/pilot-home";

/** Spec 2026-10-07 §4: an error of / has a way out. A member whose owner never confirmed their email sees who to ask. */

const OWNER = "owner-unverified@example.test";
const MEMBER = "member-of-unverified@example.test";

test("a member of a workspace whose owner has not confirmed sees the owner's name and can try again", async ({ page }) => {
  await ensureIdentity(OWNER, "Dona Sem Confirmar");
  await ensureIdentity(MEMBER, "Membro E2E");
  await withDb(async (db) => {
    await db.query(`update adscale_app."user" set email_verified = false where email = $1`, [OWNER]);
    // The member joins the owner's workspace (and leaves its own): the opening needs a verified owner, so it is refused.
    await db.query(
      `update adscale_app.workspace_members set workspace_id = (
         select m.workspace_id from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = $1),
         role = 'member'
       where user_id = (select id from adscale_app."user" where email = $2)`,
      [OWNER, MEMBER],
    );
    await db.query(
      `delete from adscale_equipe.equipe_accounts where workspace_id = (
         select m.workspace_id from adscale_app.workspace_members m join adscale_app."user" u on u.id = m.user_id where u.email = $1)`,
      [OWNER],
    );
  });
  await loginAs(page, MEMBER);
  await page.goto("/");
  const problem = page.getByTestId("home-open-problem");
  await expect(problem).toHaveAttribute("data-kind", "ownerFirst");
  await expect(problem).toContainText("Dona Sem Confirmar");
  await expect(problem.getByRole("button", { name: "Tentar de novo" })).toBeEnabled();
});
