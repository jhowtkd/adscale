export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong" | "empty";

export function validatePassword(password: string): PasswordRequirement[] {
  return [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function getPasswordStrength(
  requirements: PasswordRequirement[]
): PasswordStrength {
  const metCount = requirements.filter((r) => r.met).length;
  if (metCount === 0) return "empty";
  if (metCount <= 1) return "weak";
  if (metCount === 2) return "fair";
  if (metCount === 3) return "good";
  return "strong";
}
