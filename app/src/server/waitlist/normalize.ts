export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `55${digits}`;
  return digits;
}

export function isValidWhatsappLength(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 15;
}
