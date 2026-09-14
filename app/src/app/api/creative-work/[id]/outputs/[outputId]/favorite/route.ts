import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  addPieceFavorite,
  getCreativeWorkOutputForFavorite,
  isPieceFavorited,
  removePieceFavorite,
} from "@/server/repositories/piece-favorites";

async function loadFavoritableOutput(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
}) {
  const output = await getCreativeWorkOutputForFavorite(input);
  if (!output) return { error: "missing" as const };
  if (output.status !== "completed" || !output.outputKey) {
    return { error: "not_ready" as const };
  }
  return { output };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> },
) {
  try {
    const [{ user, workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const loaded = await loadFavoritableOutput({
      workspaceId: workspace.id,
      workItemId: id,
      outputId,
    });
    if ("error" in loaded && loaded.error === "missing") {
      return apiError("creativeWorkOutputNotFound", 404);
    }
    if ("error" in loaded) {
      return apiError("creativeWorkOutputNotSelectable", 409);
    }
    const favorite = await isPieceFavorited({ userId: user.id, outputId });
    return NextResponse.json({ favorite });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].favorite.GET");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> },
) {
  try {
    const [{ user, workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const loaded = await loadFavoritableOutput({
      workspaceId: workspace.id,
      workItemId: id,
      outputId,
    });
    if ("error" in loaded && loaded.error === "missing") {
      return apiError("creativeWorkOutputNotFound", 404);
    }
    if ("error" in loaded) {
      return apiError("creativeWorkOutputNotSelectable", 409);
    }
    const result = await addPieceFavorite({
      workspaceId: workspace.id,
      userId: user.id,
      outputId,
    });
    return NextResponse.json({ favorite: true, id: result.id });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].favorite.PUT");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> },
) {
  try {
    const [{ user, workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const loaded = await loadFavoritableOutput({
      workspaceId: workspace.id,
      workItemId: id,
      outputId,
    });
    if ("error" in loaded && loaded.error === "missing") {
      return apiError("creativeWorkOutputNotFound", 404);
    }
    if ("error" in loaded) {
      return apiError("creativeWorkOutputNotSelectable", 409);
    }
    await removePieceFavorite({ userId: user.id, outputId });
    return NextResponse.json({ favorite: false });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].favorite.DELETE");
  }
}
