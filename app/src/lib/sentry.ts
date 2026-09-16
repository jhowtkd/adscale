import { captureExceptionOnce } from "./logger";

export function captureException(error: unknown, context?: Record<string, unknown>) {
  captureExceptionOnce(error, context);
}
