import { db } from "@/server/db";
import { workspaces } from "@/server/db/schema";
import { getCampaigns } from "@/server/repositories/campaign";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import { getClientProfiles } from "@/server/repositories/client-reference";
import { listOutputDecisionEvents } from "@/server/repositories/output-decision-event";
import {
  buildCalibrationRow,
  buildCenbrapCalibrationReport,
  matchCenbrapCampaign,
  normalizeCampaignRow,
  normalizeDerivationRow,
  normalizeHumanDecisionFromEvent,
  type CenbrapCalibrationCampaignSection,
} from "./cenbrap-calibration";

export interface RunCenbrapCalibrationInput {
  workspaceId?: string;
  capturedAt?: string;
}

export interface RunCenbrapCalibrationResult {
  report: ReturnType<typeof buildCenbrapCalibrationReport>;
}

async function listWorkspaceIds(workspaceId?: string): Promise<string[]> {
  if (workspaceId) {
    return [workspaceId];
  }

  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  return rows.map((row) => row.id);
}

function pickLatestDecisionEvent(
  events: Awaited<ReturnType<typeof listOutputDecisionEvents>>
) {
  const reviewEvents = events.filter((event) =>
    ["approved", "rejected", "regenerated"].includes(event.action)
  );
  return reviewEvents[0] ?? null;
}

export async function runCenbrapCalibration(
  input: RunCenbrapCalibrationInput = {}
): Promise<RunCenbrapCalibrationResult> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const workspaceIds = await listWorkspaceIds(input.workspaceId);
  const sections: CenbrapCalibrationCampaignSection[] = [];

  for (const workspaceId of workspaceIds) {
    const [campaigns, profiles] = await Promise.all([
      getCampaigns(workspaceId, 200),
      getClientProfiles(workspaceId),
    ]);

    const profileNameById = new Map(
      profiles.map((profile) => [profile.id, profile.name])
    );

    for (const campaign of campaigns) {
      const clientProfileName = campaign.clientProfileId
        ? profileNameById.get(campaign.clientProfileId) ?? null
        : null;
      const match = matchCenbrapCampaign({
        campaign,
        clientProfileName,
      });

      if (!match.isMatch) {
        continue;
      }

      const derivations = await getDerivationsByCampaign(campaign.id, workspaceId);
      const outputDerivations = derivations.filter(
        (derivation) => derivation.outputKey && !derivation.isPreview
      );

      const rows = await Promise.all(
        outputDerivations.map(async (derivation) => {
          const events = await listOutputDecisionEvents({
            workspaceId,
            campaignId: campaign.id,
            derivationId: derivation.id,
            limit: 20,
          });
          const latestEvent = pickLatestDecisionEvent(events);
          const human = normalizeHumanDecisionFromEvent(latestEvent);

          return buildCalibrationRow({
            derivation: normalizeDerivationRow({
              id: derivation.id,
              campaignId: derivation.campaignId,
              workspaceId: derivation.workspaceId,
              status: derivation.status,
              format: derivation.format,
              generationMode: derivation.generationMode,
              variantIndex: derivation.variantIndex,
              outputKey: derivation.outputKey,
              isPreview: derivation.isPreview,
              olharVerdict: derivation.olharVerdict,
              exportStatus: derivation.exportStatus,
            }),
            human,
          });
        })
      );

      sections.push({
        campaign: normalizeCampaignRow({
          campaign: {
            id: campaign.id,
            workspaceId: campaign.workspaceId,
            name: campaign.name,
            client: campaign.client,
            clientProfileId: campaign.clientProfileId,
            status: campaign.status,
          },
          clientProfileName,
          selectionSignals: match.signals,
        }),
        rows,
      });
    }
  }

  const report = buildCenbrapCalibrationReport({
    capturedAt,
    mode: "live",
    campaigns: sections,
    evidenceNotes:
      sections.length === 0
        ? [
            "No Cenbrap campaigns matched conservative selection signals.",
            "Template or insufficient_sample status is expected until live data exists.",
          ]
        : [
            "Live Cenbrap calibration run — agreement claims remain blocked until sample guidance clears.",
            "Jhonatan's decisions are the calibration authority.",
          ],
  });

  return { report };
}
