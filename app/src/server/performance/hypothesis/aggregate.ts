import type { CreativePerformanceSnapshot } from "../../db/schema";
import { derivePerformanceMetrics } from "../metrics";

export interface AggregatedSnapshotMetrics {
  impressions: string;
  clicks: string;
  spend: string;
  conversions: string;
  conversionValue: string;
  period: { startDate: string; endDate: string } | null;
  platforms: string[];
}

function addDecimalStrings(a: string, b: string): string {
  const scale = Math.max(
    (a.split(".")[1] ?? "").length,
    (b.split(".")[1] ?? "").length
  );
  const factor = 10 ** scale;
  const sum =
    Math.round(parseFloat(a) * factor) + Math.round(parseFloat(b) * factor);
  return (sum / factor).toFixed(scale);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function aggregateSnapshots(
  snapshots: CreativePerformanceSnapshot[]
): AggregatedSnapshotMetrics {
  if (snapshots.length === 0) {
    return {
      impressions: "0",
      clicks: "0",
      spend: "0",
      conversions: "0",
      conversionValue: "0",
      period: null,
      platforms: [],
    };
  }

  let impressions = "0";
  let clicks = "0";
  let spend = "0";
  let conversions = "0";
  let conversionValue = "0";
  let startDate = snapshots[0]!.startDate;
  let endDate = snapshots[0]!.endDate;
  const platforms = new Set<string>();

  for (const snap of snapshots) {
    impressions = addDecimalStrings(impressions, snap.impressions);
    clicks = addDecimalStrings(clicks, snap.clicks);
    spend = addDecimalStrings(spend, snap.spend);
    conversions = addDecimalStrings(conversions, snap.conversions);
    conversionValue = addDecimalStrings(conversionValue, snap.conversionValue);
    startDate = minDate(startDate, snap.startDate);
    endDate = maxDate(endDate, snap.endDate);
    platforms.add(snap.platform);
  }

  return {
    impressions,
    clicks,
    spend,
    conversions,
    conversionValue,
    period: { startDate, endDate },
    platforms: [...platforms],
  };
}

export function getPrimaryMetricValue(
  metric: string,
  raw: AggregatedSnapshotMetrics
): string | null {
  const derived = derivePerformanceMetrics({
    impressions: raw.impressions,
    clicks: raw.clicks,
    spend: raw.spend,
    conversions: raw.conversions,
    conversionValue: raw.conversionValue,
  });

  switch (metric) {
    case "ctr":
      return derived.ctr;
    case "cpc":
      return derived.cpc;
    case "cpa":
      return derived.cpa;
    case "roas":
      return derived.roas;
    case "conversions":
      return raw.conversions;
    case "clicks":
      return raw.clicks;
    case "impressions":
      return raw.impressions;
    case "spend":
      return raw.spend;
    case "conversion_value":
      return raw.conversionValue;
    default:
      return null;
  }
}
