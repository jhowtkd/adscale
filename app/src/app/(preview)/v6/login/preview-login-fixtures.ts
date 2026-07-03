import type { AuthV6BrandingLabels } from "@/components/auth/v6/auth-v6-types";

export const previewAuthLabels = {
  accessLabel: "acesso",
  welcomeBack: "Bem-vindo de volta",
  signInSubtitle: "Entre na sua conta ADScale",
  email: "E-mail",
  password: "Senha",
  emailPlaceholder: "voce@exemplo.com",
  signIn: "Entrar",
  orContinueWith: "ou continue com",
};

export const previewAuthBranding: AuthV6BrandingLabels = {
  sectionLabel: "ADScale",
  title: "Supervisão criativa com IA no loop",
  subtitle:
    "De uma peça base e um briefing a um lote de variações prontas — você faz o briefing, a IA auxilia, você cura o que vai ao ar.",
  features: [
    {
      title: "Briefing estruturado",
      body: "Capture objetivo, público e tom antes de gerar qualquer variação.",
    },
    {
      title: "Lotes de derivações",
      body: "Gere múltiplas versões a partir da mesma peça base com controle de qualidade.",
    },
    {
      title: "Revisão e aprovação",
      body: "Aprove, rejeite e exporte só o que está pronto para ir ao ar.",
    },
  ],
};
