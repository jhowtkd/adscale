export class CalibrationAdjustmentError extends Error {
  constructor(
    public readonly code:
      | "adjustment_not_found"
      | "adjustment_not_proposed"
      | "insufficient_evidence"
      | "insufficient_acknowledgment",
    message: string
  ) {
    super(message);
    this.name = "CalibrationAdjustmentError";
  }
}
