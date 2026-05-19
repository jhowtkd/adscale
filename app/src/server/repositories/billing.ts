import { eq } from "drizzle-orm";

import { db } from "../db";
import { billingCustomers } from "../db/schema";

export async function getBillingCustomerByWorkspace(workspaceId: string) {
  const rows = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.workspaceId, workspaceId))
    .limit(1);

  return rows[0] ?? null;
}

export async function saveBillingCustomer(data: {
  workspaceId: string;
  stripeCustomerId: string;
}) {
  const rows = await db
    .insert(billingCustomers)
    .values({
      workspaceId: data.workspaceId,
      stripeCustomerId: data.stripeCustomerId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: billingCustomers.workspaceId,
      set: {
        stripeCustomerId: data.stripeCustomerId,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0];
}

