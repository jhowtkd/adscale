import { redirect } from "next/navigation";
import { COMPOSER_PATH } from "@/lib/studio/composer-href";

export default function TemplatesPage() {
  redirect(COMPOSER_PATH);
}
