/**
 * Records, through the module's own command, that the diagnosis of the current reading failed with `code` (ticket 13, D-12).
 *
 * The state of an account whose free credit ended before the diagnosis needs the diagnosis job's failure, which only the job may write. This runs the same
 * command the job runs (`diagnosis_fail`, as the diagnosis task) for the intent that the real "É isso" wrote, so the conversation gets the failure card the
 * way the server projects it, and the plan request, the chat and the account state see the real thing. Used by the E2E of the pilot and by anyone who wants
 * to see the screen.
 *
 *   cd app
 *   export DATABASE_URL=postgres://…/some_throwaway_test            # the database of the server under test; its name must end with _test
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/pilot-diagnosis-fail.ts [budget_exceeded|provider_error|…] [email]
 *
 * With an email, it picks the oldest account of that user's workspace (the E2E passes the pilot's, so other identities in the same database do not matter).
 * Without one, one account is expected in that database (the pilot's): it picks the oldest of all. Click "É isso" first (or confirm the brand): without a
 * diagnose intent there is nothing to fail.
 */
import { sql } from "drizzle-orm";
import { db } from "../src/server/db";
import { createEquipeRouteDeps } from "../src/server/equipe/http/deps";
import { executeCommand } from "../src/server/equipe/module/commands";
import { HANDOFF_DIAGNOSE_EVENT } from "../src/server/equipe/handoff/contract";

async function main() {
  const code = process.argv[2] ?? "budget_exceeded";
  if (!/_test$/.test(new URL(process.env.DATABASE_URL ?? "postgres://none/none").pathname)) throw new Error("Refusing to write: DATABASE_URL must name a database that ends with _test.");
  const email = process.argv[3];
  const account = (await db.execute(email
    ? sql`select a.id, a.workspace_id from adscale_equipe.equipe_accounts a
            join adscale_app.workspace_members m on m.workspace_id = a.workspace_id
            join adscale_app."user" u on u.id = m.user_id
           where u.email = ${email} order by a.created_at limit 1`
    : sql`select id, workspace_id from adscale_equipe.equipe_accounts order by created_at limit 1`)).rows[0] as { id: string; workspace_id: string } | undefined;
  if (!account) throw new Error(email ? `No account for ${email}: sign in as that user and open / once.` : "No account in this database: sign in and open / once.");
  const intent = (await db.execute(sql`select id from adscale_equipe.equipe_events where account_id = ${account.id} and event_type = 'task.requested'
    and payload->>'eventName' = ${HANDOFF_DIAGNOSE_EVENT} order by occurred_at desc limit 1`)).rows[0] as { id: string } | undefined;
  if (!intent) throw new Error('No diagnose intent: click "É isso" first.');
  const outcome = await executeCommand(createEquipeRouteDeps(account.workspace_id), { workspaceId: account.workspace_id, accountId: account.id,
    actor: { kind: "system", job: HANDOFF_DIAGNOSE_EVENT } }, { type: "diagnosis_fail", payload: { taskIntentId: intent.id, code } });
  console.log(JSON.stringify(outcome.ok ? { ok: true, data: outcome.value.data } : { ok: false, error: outcome.error }));
  process.exit(outcome.ok ? 0 : 1);
}
void main();
