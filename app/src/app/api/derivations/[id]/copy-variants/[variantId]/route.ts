import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { selectCopyVariant } from "@/server/repositories/copy-variant";
import { db } from "@/server/db";
import { derivationCopyVariants, derivations } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

const selectSchema = z.object({
  isSelected: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: derivationId, variantId } = await params;

    const body = await request.json();
    const parsed = selectSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    // If selecting this variant, deselect others first
    if (parsed.data.isSelected) {
      await db
        .update(derivationCopyVariants)
        .set({ isSelected: false })
        .where(
          and(
            eq(derivationCopyVariants.derivationId, derivationId),
            eq(derivationCopyVariants.workspaceId, workspace.id)
          )
        );

      // Also update the derivation's ctaText if the variant has one
      const variant = await db
        .select()
        .from(derivationCopyVariants)
        .where(
          and(
            eq(derivationCopyVariants.id, variantId),
            eq(derivationCopyVariants.workspaceId, workspace.id)
          )
        )
        .limit(1);

      if (variant[0]?.ctaText) {
        await db
          .update(derivations)
          .set({ ctaText: variant[0].ctaText, updatedAt: new Date() })
          .where(
            and(
              eq(derivations.id, derivationId),
              eq(derivations.workspaceId, workspace.id)
            )
          );
      }
    }

    const updated = await selectCopyVariant(
      variantId,
      derivationId,
      workspace.id,
      parsed.data.isSelected
    );

    if (!updated) {
      return apiError("variantNotFound", 404);
    }

    return NextResponse.json({ variant: updated });
  } catch (error) {
    return handleApiError(error, "derivations.[id].copy-variants.[variantId].PATCH");
  }
}
