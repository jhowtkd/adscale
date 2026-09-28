"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceAssets } from "@/lib/hooks/use-workspace-assets";
import { registerEquipeMaterial } from "@/lib/equipe/commands";
import type { GoalsDecisionsJson } from "@/lib/equipe/api";
import { ActionError, useDecisionRunner } from "./GoalsActions";

// The Coleta step: pick one of the workspace's existing assets (the same
// thumbnail grid the assistant flows use) plus what the material is. The
// command still receives the asset id; already-registered materials list
// above with their translated kinds.

const MATERIAL_KINDS = ["logo", "photo", "video", "text"] as const;

function RegisteredMaterials({ materials }: { materials: GoalsDecisionsJson["materials"] }) {
  const t = useTranslations("equipe.goals");
  if (materials.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {materials.map((material) => {
        const kindKey = `materialKind_${material.kind}`;
        const kind = t.has(kindKey) ? t(kindKey) : material.kind;
        return (
          <li
            key={`${material.assetId}-${material.kind}`}
            className="text-xs text-[var(--text-secondary)]"
          >
            {[kind, material.origin].filter(Boolean).join(" · ") || material.assetId}
          </li>
        );
      })}
    </ul>
  );
}

export function MaterialsAction({
  accountId,
  materials,
}: {
  accountId: string;
  materials: GoalsDecisionsJson["materials"];
}) {
  const t = useTranslations("equipe.goals");
  const { isPending, error, run } = useDecisionRunner(accountId);
  const { data, isLoading } = useWorkspaceAssets({ limit: 24 });
  const [assetId, setAssetId] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [origin, setOrigin] = useState("");
  const assets = data?.assets ?? [];
  const selected = assets.find((asset) => asset.id === assetId) ?? null;

  return (
    <div className="flex flex-col gap-2" data-testid="goals-action-materials">
      <RegisteredMaterials materials={materials} />
      <p className="text-xs text-[var(--text-secondary)]">{t("materialExplainer")}</p>
      <fieldset>
        <legend className="text-xs font-medium text-[var(--text-primary)]">
          {t("materialAssetLabel")}
        </legend>
        {isLoading ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]" role="status">
            {t("materialLoading")}
          </p>
        ) : assets.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("materialEmpty")}</p>
        ) : (
          <div
            className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4"
            role="radiogroup"
            aria-label={t("materialAssetLabel")}
          >
            {assets.map((asset) => {
              const checked = asset.id === assetId;
              return (
                <button
                  key={asset.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  title={asset.name}
                  onClick={() => setAssetId(asset.id)}
                  data-testid={`goals-material-pick-${asset.id}`}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg border bg-[var(--surface-raised)]",
                    checked
                      ? "border-[var(--selection-border)] ring-2 ring-[var(--selection-border)]"
                      : "border-[var(--border-dim)]",
                  )}
                >
                  {asset.url ? (
                    <Image
                      src={asset.url}
                      alt={asset.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-[var(--text-muted)]">
                      <ImageIcon className="size-5" aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      {selected ? (
        <p className="text-xs text-[var(--text-secondary)]" data-testid="goals-material-chosen">
          {selected.name}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          aria-label={t("materialKindLabel")}
          data-testid="goals-material-kind"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
        >
          <option value="">{t("materialKindPlaceholder")}</option>
          {MATERIAL_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(`materialKind_${option}`)}
            </option>
          ))}
        </select>
        <input
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          placeholder={t("materialOriginPlaceholder")}
          aria-label={t("materialOriginPlaceholder")}
          data-testid="goals-material-origin"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
        />
      </div>
      <ActionError message={error} testId="goals-material-error" />
      <div>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isPending || !assetId || !kind}
          onClick={() =>
            assetId && kind
              ? void run(
                  () =>
                    registerEquipeMaterial(accountId, {
                      assetId,
                      kind,
                      ...(origin.trim() ? { origin: origin.trim() } : {}),
                    }),
                  t("materialSent"),
                ).then((sent) => {
                  if (sent) {
                    setAssetId(null);
                    setKind("");
                    setOrigin("");
                  }
                })
              : undefined
          }
          data-testid="goals-material-send"
        >
          {t("materialSend")}
        </Button>
      </div>
    </div>
  );
}
