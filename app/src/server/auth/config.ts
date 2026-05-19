export function buildTrustedOrigins(values: {
  betterAuthUrl: string;
  appUrl: string;
  isDevelopment?: boolean;
}) {
  const origins = [values.betterAuthUrl, values.appUrl];

  if (values.isDevelopment) {
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  return Array.from(new Set(origins));
}
