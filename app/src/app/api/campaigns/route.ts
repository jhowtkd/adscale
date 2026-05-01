import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createCampaign,
  getCampaigns,
} from "@/server/repositories/campaign";

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().optional(),
  product: z.string().optional(),
  objective: z.string().optional(),
  audience: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  tone: z.string().optional(),
  offer: z.string().optional(),
  constraints: z.string().optional(),
  notes: z.string().optional(),
  generationMode: z.enum(["art_variation", "format_adaptation", "restyling"]).optional(),
  ctaVariants: z.array(z.string()).max(3).optional(),
  targetFormats: z.array(z.enum(["1:1", "4:5", "9:16"])).max(1).optional(),
  creativeLevel: z.enum(["conservative", "balanced", "bold"]).optional().default("balanced"),
})
.refine(
  (data) => {
    const mode = data.generationMode ?? "art_variation";
    return mode !== "format_adaptation" || (data.targetFormats?.length === 1);
  },
  { message: "format_adaptation requires exactly 1 targetFormat", path: ["targetFormats"] }
);

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const items = await getCampaigns(workspace.id);
    return NextResponse.json({ campaigns: items });
  } catch (error) {
    return handleApiError(error, "campaigns.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const campaign = await createCampaign(workspace.id, {
      ...parsed.data,
      status: "draft",
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.POST");
  }
}
