export function studioStageOccupancy(input: {
  hasContinueWork: boolean;
  outputCount: number;
  sourceCount: number;
  hasOpenWork?: boolean;
}): "empty" | "work" {
  if (
    input.hasContinueWork
    || input.hasOpenWork
    || input.outputCount > 0
    || input.sourceCount > 0
  ) {
    return "work";
  }
  return "empty";
}
