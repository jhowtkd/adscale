"use client";

import { useReducer, useEffect, useRef, useMemo } from "react";
import { m, useReducedMotion } from "@/components/animations/MotionBoundary";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useWorkspaceSettings,
  useUpdateWorkspaceSettings,
} from "@/lib/hooks/use-workspace-settings";
import {
  settingsButtonClass,
  settingsDangerButtonClass,
  settingsFieldClass,
  settingsHintClass,
  settingsSectionTitleClass,
  settingsTextareaClass,
} from "@/components/settings/settings-chrome";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface WorkspaceFormState {
  name: string;
  slug: string;
  description: string;
  industry: string;
  website: string;
  timezone: string;
  saveState: "idle" | "saving" | "saved";
}

function workspaceFormReducer(
  state: WorkspaceFormState,
  payload: Partial<WorkspaceFormState>
): WorkspaceFormState {
  return { ...state, ...payload };
}

const initialFormState: WorkspaceFormState = {
  name: "",
  slug: "",
  description: "",
  industry: "",
  website: "",
  timezone: "",
  saveState: "idle",
};

export default function WorkspaceTab() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const reducedMotion = useReducedMotion();

  const { data: settings, isLoading, isError, error } = useWorkspaceSettings();
  const updateSettings = useUpdateWorkspaceSettings();

  const [form, updateForm] = useReducer(workspaceFormReducer, initialFormState);
  const { name, slug, description, industry, website, timezone, saveState } = form;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canEdit = settings?.canEdit !== false;

  useEffect(() => {
    const saveTimeoutStore = saveTimeoutRef;
    return () => {
      if (saveTimeoutStore.current) clearTimeout(saveTimeoutStore.current);
    };
  }, []);

  useEffect(() => {
    if (settings) {
      requestAnimationFrame(() => {
        updateForm({
          name: settings.name,
          slug: settings.slug,
          description: settings.description,
          industry: settings.industry,
          website: settings.website,
          timezone: settings.timezone,
        });
      });
    }
  }, [settings]);

  const hasChanges = useMemo(() => {
    if (!settings) {
      return (
        name !== "" ||
        slug !== "" ||
        description !== "" ||
        industry !== "" ||
        website !== "" ||
        timezone !== ""
      );
    }
    return (
      name !== settings.name ||
      slug !== settings.slug ||
      description !== settings.description ||
      industry !== settings.industry ||
      website !== settings.website ||
      timezone !== settings.timezone
    );
  }, [settings, name, slug, description, industry, website, timezone]);

  const handleSave = () => {
    updateForm({ saveState: "saving" });
    updateSettings.mutate(
      { name, slug, description, industry, website, timezone },
      {
        onSuccess: () => {
          updateForm({ saveState: "saved" });
          addToast("success", tc("workspaceUpdated"));
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(
            () => updateForm({ saveState: "idle" }),
            2000
          );
        },
        onError: (err) => {
          updateForm({ saveState: "idle" });
          addToast("error", err.message || tc("error"));
        },
      }
    );
  };

  return (
    <m.div
      variants={containerVariants}
      initial={reducedMotion ? false : "hidden"}
      animate="show"
      className="max-w-[560px] space-y-8"
    >
      {isLoading && (
        <div className="space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <p className="text-sm text-[var(--danger-text)]">
          {error?.message || tc("error")}
        </p>
      )}

      {!isLoading && !isError && (
        <>
          {/* Workspace Info Section */}
          <div className="space-y-5">
            {!canEdit && (
              <p className="text-sm text-[var(--text-secondary)]">
                {t("workspace.readOnlyNotice")}
              </p>
            )}

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("workspaceName")}
              </label>
              <input
                type="text"
                aria-label={t("workspaceName")}
                value={name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder={t("workspace.namePlaceholder")}
                disabled={!canEdit}
                className={settingsFieldClass}
              />
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("workspaceUrl")}
              </label>
              <div className="flex items-center h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm">
                <span className="text-[var(--text-muted)] select-none">
                  adscale.app/w/
                </span>
                <input
                  type="text"
                  aria-label={t("workspaceUrl")}
                  value={slug}
                  onChange={(e) =>
                    updateForm({
                      slug: e.target.value.replace(/[^a-z0-9-]/g, ""),
                    })
                  }
                  disabled={!canEdit}
                  className={cn(
                    "flex-1 bg-transparent text-[var(--text-primary)] outline-none",
                    "placeholder:text-[var(--text-muted)]",
                    "disabled:opacity-60 disabled:cursor-not-allowed"
                  )}
                />
              </div>
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("description")}
              </label>
              <textarea
                aria-label={t("description")}
                value={description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder={t("workspace.descriptionPlaceholder")}
                rows={3}
                disabled={!canEdit}
                className={cn(settingsTextareaClass, "resize-none")}
              />
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("industry")}
              </label>
              <select
                aria-label={t("industry")}
                value={industry}
                onChange={(e) => updateForm({ industry: e.target.value })}
                disabled={!canEdit}
                className={cn(settingsFieldClass, "appearance-none cursor-pointer")}
              >
                <option>Marketing & Advertising</option>
                <option>E-commerce</option>
                <option>Technology</option>
                <option>Finance</option>
                <option>Healthcare</option>
                <option>Education</option>
                <option>Entertainment</option>
                <option>Travel & Hospitality</option>
                <option>Real Estate</option>
                <option>Other</option>
              </select>
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("website")}
              </label>
              <input
                type="url"
                aria-label={t("website")}
                value={website}
                onChange={(e) => updateForm({ website: e.target.value })}
                placeholder={t("workspace.urlPlaceholder")}
                disabled={!canEdit}
                className={settingsFieldClass}
              />
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("timeZone")}
              </label>
              <select
                aria-label={t("timeZone")}
                value={timezone}
                onChange={(e) => updateForm({ timezone: e.target.value })}
                disabled={!canEdit}
                className={cn(settingsFieldClass, "appearance-none cursor-pointer")}
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="Europe/London">London (GMT)</option>
                <option value="Europe/Paris">Paris (CET)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Asia/Singapore">Singapore (SGT)</option>
                <option value="Australia/Sydney">Sydney (AEDT)</option>
              </select>
            </m.div>
          </div>

          {/* Save Button */}
          <m.div variants={itemVariants} className="flex justify-end border-t border-[var(--border-dim)] pt-6">
            <button
              type="button"
              onClick={handleSave}
              disabled={
                !canEdit ||
                !hasChanges ||
                saveState !== "idle" ||
                updateSettings.isPending
              }
              className={settingsButtonClass}
            >
              {saveState === "saving" && (
                <m.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="size-4 rounded-full border-2 border-current/30 border-t-current"
                />
              )}
              {saveState === "saved" && <Check size={16} />}
              <span>
                {saveState === "saving"
                  ? t("saving")
                  : saveState === "saved"
                    ? t("saved")
                    : t("saveWorkspace")}
              </span>
            </button>
          </m.div>

          <m.div
            variants={itemVariants}
            className="space-y-3 border-t border-[var(--border-dim)] pt-8"
          >
            <h3 className={settingsSectionTitleClass}>{t("dangerZone")}</h3>
            <p className={settingsHintClass}>{t("deleteWorkspaceWarning")}</p>
            <button
              type="button"
              onClick={() => addToast("error", tc("comingSoon"))}
              disabled={!canEdit}
              className={settingsDangerButtonClass}
            >
              {t("deleteWorkspace")}
            </button>
          </m.div>
        </>
      )}
    </m.div>
  );
}
