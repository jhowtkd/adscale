/** Tag openings use the strategist's existing convention; loose comparisons stay literal. */
export const TAG_OPEN = /<(?=[A-Za-z/!?])/g;

export function neutralizeUntrusted(value: string): string {
  return value.replace(/<\/?untrusted-data>/gi, "");
}

export function wrapUntrusted(value: string): string {
  return `<untrusted-data>\n${neutralizeUntrusted(value)}\n</untrusted-data>`;
}
