import type { Metadata } from "next";
import SignupContent from "./SignupContent";

export const metadata: Metadata = {
  title: "Criar conta | ADScale",
  description: "Crie sua conta ADScale.",
};

export default function SignupPage() {
  return <SignupContent />;
}
