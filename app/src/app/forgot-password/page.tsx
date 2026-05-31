import type { Metadata } from "next";
import ForgotPasswordContent from "./ForgotPasswordContent";

export const metadata: Metadata = {
  title: "Recuperar senha | ADScale",
  description: "Solicite um link para redefinir sua senha.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordContent />;
}
