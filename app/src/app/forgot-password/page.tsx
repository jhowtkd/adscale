import type { Metadata } from "next";
import { Suspense } from "react";
import ForgotPasswordContent from "./ForgotPasswordContent";

export const metadata: Metadata = {
  title: "Recuperar senha | ADScale",
  description: "Solicite um link para redefinir sua senha.",
};

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
