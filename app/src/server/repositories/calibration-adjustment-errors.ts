export class CalibrationAdjustmentError extends Error {
  constructor(
    public readonly code:
      | "adjustment_not_found"
      | "adjustment_not_proposed"
      | "insufficient_evidence",
    message: string
  ) {
    super(message);
    this.name = "CalibrationAdjustmentError";
  }
}
