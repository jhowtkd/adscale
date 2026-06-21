import { permanentRedirect } from "next/navigation";

export default function FeedbackLegacyRedirect() {
  permanentRedirect("/admin/feedbacks");
}
