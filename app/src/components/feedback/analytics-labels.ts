import { useTranslations } from "next-intl";

export function formatFallbackKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function useAnalyticsLabels() {
  const t = useTranslations("feedback.analytics");
  const tMission = useTranslations("dashboard.missions.items");
  const tRecipe = useTranslations("strategy.recipes");
  const tStep = useTranslations("guidedBriefing.steps");
  const tDimension = useTranslations("readiness.dimensions");

  const missionLabel = (key: string) => {
    if (tMission.has(`${key}.label`)) return tMission(`${key}.label`);
    if (t.has(`stages.${key}`)) return t(`stages.${key}`);
    return formatFallbackKey(key);
  };

  const stageLabel = (key: string) => {
    if (t.has(`stages.${key}`)) return t(`stages.${key}`);
    return missionLabel(key);
  };

  const recipeLabel = (key: string) => {
    if (tRecipe.has(`${key}.name`)) return tRecipe(`${key}.name`);
    return formatFallbackKey(key);
  };

  const stepLabel = (key: string) => {
    if (tStep.has(`${key}.title`)) return tStep(`${key}.title`);
    return formatFallbackKey(key);
  };

  const dimensionLabel = (key: string) => {
    if (tDimension.has(key)) return tDimension(key);
    return formatFallbackKey(key);
  };

  const operationLabel = (key: string) => {
    if (t.has(`operations.${key}`)) return t(`operations.${key}`);
    return formatFallbackKey(key);
  };

  const assistanceLabel = (key: string) => {
    if (t.has(`assistanceLevels.${key}`)) return t(`assistanceLevels.${key}`);
    return formatFallbackKey(key);
  };

  return {
    t,
    missionLabel,
    stageLabel,
    recipeLabel,
    stepLabel,
    dimensionLabel,
    operationLabel,
    assistanceLabel,
  };
}
