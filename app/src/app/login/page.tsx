import type { Metadata } from "next";
import LoginContent from "./LoginContent";

export const metadata: Metadata = {
  title: "Login | ADScale",
  description: "Entre na sua conta ADScale.",
};

export default function LoginPage() {
  return <LoginContent />;
}
