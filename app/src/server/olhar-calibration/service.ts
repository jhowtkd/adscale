import { db } from "@/server/db";
import { workspaces } from "@/server/db/schema";
import { getCampaigns } from "@/server/repositories/campaign";
import { getDerivationsByCampaigns } from "@/server/repositories/derivation";
import { getClientProfiles } from "@/server/repositories/client-reference";
import { listOutputDecisionEventsForDerivations } from "@/server/repositories/output-decision-event";
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
  events: Awaited<ReturnType<typeof listOutputDecisionEventsForDerivations>>
) {
  const reviewEvents = events.filter((event) =>
    ["approved", "rejected", "regenerated"].includes(event.action)
  );
  return reviewEvents[0] ?? null;
}

function latestEventForDerivation(
  eventsByDerivation: Map<string, Awaited<ReturnType<typeof listOutputDecisionEventsForDerivations>>>,
  derivationId: string
) {
  return pickLatestDecisionEvent(eventsByDerivation.get(derivationId) ?? []);
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

    const matchedCampaigns = campaigns.filter((campaign) =>
      matchCenbrapCampaign({
        campaign,
        clientProfileName: campaign.clientProfileId
          ? profileNameById.get(campaign.clientProfileId) ?? null
          : null,
      }).isMatch
    );

    if (matchedCampaigns.length === 0) continue;

    const matchedCampaignIds = matchedCampaigns.map((c) => c.id);
    const allDerivations = await getDerivationsByCampaigns(matchedCampaignIds, workspaceId);
    const outputDerivations = allDerivations.filter(
      (d) => d.outputKey && !d.isPreview
    );

    if (outputDerivations.length === 0) {
      for (const campaign of matchedCampaigns) {
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
            clientProfileName: campaign.clientProfileId
              ? profileNameById.get(campaign.clientProfileId) ?? null
              : null,
            selectionSignals: matchCenbrapCampaign({
              campaign,
              clientProfileName: campaign.clientProfileId
                ? profileNameById.get(campaign.clientProfileId) ?? null
                : null,
            }).signals,
          }),
          rows: [],
        });
      }
      continue;
    }

    const derivationIds = outputDerivations.map((d) => d.id);
    const allEvents = await listOutputDecisionEventsForDerivations(
      derivationIds,
      workspaceId,
      20
    );

    const eventsByDerivation = new Map<
      string,
      Awaited<ReturnType<typeof listOutputDecisionEventsForDerivations>>
    >();
    for (const event of allEvents) {
      const bucket = eventsByDerivation.get(event.derivationId) ?? [];
      bucket.push(event);
      eventsByDerivation.set(event.derivationId, bucket);
    }

    const derivationsByCampaign = new Map<string, typeof outputDerivations>();
    for (const d of outputDerivations) {
      const bucket = derivationsByCampaign.get(d.campaignId) ?? [];
      bucket.push(d);
      derivationsByCampaign.set(d.campaignId, bucket);
    }

    for (const campaign of matchedCampaigns) {
      const clientProfileName = campaign.clientProfileId
        ? profileNameById.get(campaign.clientProfileId) ?? null
        : null;
      const match = matchCenbrapCampaign({ campaign, clientProfileName });
      const derivations = derivationsByCampaign.get(campaign.id) ?? [];

      const rows = derivations.map((derivation) => {
        const latestEvent = latestEventForDerivation(eventsByDerivation, derivation.id);
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
      });

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