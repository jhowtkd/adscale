import type { DecimalSeparator, PercentFormat } from "./types";

export interface NormalizeNumericOptions {
  decimalSeparator: DecimalSeparator;
  percentFormat: PercentFormat;
}

const CURRENCY_SYMBOLS = /[R$€£¥₹\s]/g;

function divideDecimalString(value: string, divisor: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const [divisorWhole = "1", divisorFraction = ""] = divisor.split(".");
  const outputScale = fraction.length + divisorFraction.length + 6;
  const numerator =
    BigInt(`${whole}${fraction}`) *
    BigInt(10) ** BigInt(outputScale - fraction.length + divisorFraction.length);
  const denominator = BigInt(`${divisorWhole}${divisorFraction}`);
  const quotient = numerator / denominator;
  const padded = quotient.toString().padStart(outputScale + 1, "0");
  const splitAt = padded.length - outputScale;
  const intPart = padded.slice(0, splitAt).replace(/^0+/, "") || "0";
  const fracPart = padded.slice(splitAt).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

export function normalizeNumericString(
  raw: string,
  options: NormalizeNumericOptions
): { value: string | null; error?: string } {
  let value = raw.trim();
  if (!value) {
    return { value: null, error: "Value is required" };
  }

  const isPercent = value.endsWith("%");
  if (isPercent) {
    value = value.slice(0, -1).trim();
  }

  value = value.replace(CURRENCY_SYMBOLS, "");

  if (options.decimalSeparator === ",") {
    value = value.replace(/\./g, "");
    value = value.replace(",", ".");
  } else {
    value = value.replace(/,/g, "");
  }

  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return { value: null, error: "Invalid numeric format" };
  }

  if (isPercent && options.percentFormat === "percent") {
    value = divideDecimalString(value, "100");
  }

  return { value };
}

export function normalizeIntegerString(
  raw: string,
  options: NormalizeNumericOptions
): { value: string | null; error?: string } {
  const result = normalizeNumericString(raw, options);
  if (result.error || result.value === null) {
    return result;
  }
  if (!/^(?:0|[1-9]\d*)$/.test(result.value)) {
    return { value: null, error: "Must be a whole number" };
  }
  return result;
}

export function normalizeDateString(raw: string): { value: string | null; error?: string } {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value: null, error: "Must be YYYY-MM-DD" };
  }
  return { value };
}

export function normalizeCurrency(
  raw: string | undefined,
  defaultCurrency: string
): { value: string | null; error?: string } {
  const value = (raw?.trim() || defaultCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    return { value: null, error: "Currency must be uppercase ISO code" };
  }
  return { value };
}
