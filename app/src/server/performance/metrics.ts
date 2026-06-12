import type {
  DerivedPerformanceMetrics,
  RawPerformanceMetrics,
} from "./types";

interface ParsedDecimal {
  coefficient: bigint;
  scale: number;
}

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;

export function parseNonNegativeDecimal(value: string): ParsedDecimal {
  const normalized = value.trim();
  const match = DECIMAL_PATTERN.exec(normalized);
  if (!match) {
    throw new Error(`Invalid non-negative decimal: ${value}`);
  }

  const fraction = match[1] ?? "";
  const digits = normalized.replace(".", "");
  return {
    coefficient: BigInt(digits),
    scale: fraction.length,
  };
}

function powerOfTen(exponent: number) {
  return 10n ** BigInt(exponent);
}

function formatScaled(value: bigint, scale: number) {
  if (scale === 0) return value.toString();

  const padded = value.toString().padStart(scale + 1, "0");
  const integer = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

export function divideDecimalStrings(
  numeratorValue: string,
  denominatorValue: string,
  outputScale = 6
): string | null {
  const numerator = parseNonNegativeDecimal(numeratorValue);
  const denominator = parseNonNegativeDecimal(denominatorValue);

  if (denominator.coefficient === 0n) return null;

  const scaledNumerator =
    numerator.coefficient * powerOfTen(denominator.scale + outputScale);
  const scaledDenominator =
    denominator.coefficient * powerOfTen(numerator.scale);

  const quotient = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  const rounded = remainder * 2n >= scaledDenominator ? quotient + 1n : quotient;

  return formatScaled(rounded, outputScale);
}

export function derivePerformanceMetrics(
  metrics: RawPerformanceMetrics
): DerivedPerformanceMetrics {
  return {
    ctr: divideDecimalStrings(metrics.clicks, metrics.impressions),
    cpc: divideDecimalStrings(metrics.spend, metrics.clicks),
    cpa: divideDecimalStrings(metrics.spend, metrics.conversions),
    roas: divideDecimalStrings(metrics.conversionValue, metrics.spend),
  };
}
