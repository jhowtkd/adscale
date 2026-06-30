import SettingsV6View from "@/components/settings/v6/SettingsV6View";
import { previewSettingsCardsView, previewSettingsLabels } from "./preview-settings-fixtures";

export default function SettingsPreviewPage() {
  return <SettingsV6View labels={previewSettingsLabels} cards={previewSettingsCardsView} interactive={false} />;
}
