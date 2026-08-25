"use client";

import { useReducer, useRef, useEffect, useMemo, useState } from "react";
import { m, useReducedMotion } from "@/components/animations/MotionBoundary";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionStatusIcon } from "@/components/animations/ActionStatusIcon";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useUserProfile,
  useUpdateUserProfile,
  useUploadProfileAvatar,
} from "@/lib/hooks/use-user-profile";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

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

const fieldClass = cn(
  "w-full h-10 rounded-md border px-3 text-sm",
  "bg-[var(--surface-base)] text-[var(--text-primary)]",
  "placeholder:text-[var(--text-muted)]",
  "focus:outline-none focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)]",
  "transition-all duration-200 border-[var(--border-dim)]"
);

const readOnlyFieldClass = cn(
  fieldClass,
  "cursor-not-allowed bg-[var(--surface-raised)] text-[var(--text-muted)]"
);

interface ProfileFormState {
  firstName: string;
  lastName: string;
  bio: string;
  timezone: string;
  saveState: "idle" | "saving" | "saved" | "error";
}

function profileFormReducer(
  state: ProfileFormState,
  payload: Partial<ProfileFormState>
): ProfileFormState {
  return { ...state, ...payload };
}

export default function ProfileTab() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const reducedMotion = useReducedMotion();

  const { data: profile, isPending, isError, error } = useUserProfile();
  const updateProfile = useUpdateUserProfile();
  const uploadAvatar = useUploadProfileAvatar();

  const [form, updateForm] = useReducer(profileFormReducer, {
    firstName: "",
    lastName: "",
    bio: "",
    timezone: "",
    saveState: "idle" as const,
  });
  const { firstName, lastName, bio, timezone, saveState } = form;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(
    null
  );

  useEffect(() => {
    const saveTimeoutStore = saveTimeoutRef;
    return () => {
      if (saveTimeoutStore.current) clearTimeout(saveTimeoutStore.current);
    };
  }, []);

  useEffect(() => {
    if (profile) {
      requestAnimationFrame(() => {
        updateForm({
          firstName: profile.firstName,
          lastName: profile.lastName,
          bio: profile.bio,
          timezone: profile.timezone,
        });
        setPendingAvatarFile(null);
        setLocalAvatarPreview(null);
      });
    }
  }, [profile]);

  const hasProfileFieldChanges = useMemo(() => {
    if (!profile) return false;
    return (
      firstName !== profile.firstName ||
      lastName !== profile.lastName ||
      bio !== profile.bio ||
      timezone !== profile.timezone
    );
  }, [profile, firstName, lastName, bio, timezone]);

  const hasChanges = hasProfileFieldChanges || pendingAvatarFile !== null;

  const avatarDisplay =
    localAvatarPreview ?? profile?.avatarUrl ?? "";

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      addToast("error", tc("avatarSizeError"));
      return;
    }
    setPendingAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLocalAvatarPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveAvatar = () => {
    setPendingAvatarFile(null);
    setLocalAvatarPreview(null);
  };

  const handleSave = async () => {
    updateForm({ saveState: "saving" });
    try {
      if (pendingAvatarFile) {
        await uploadAvatar.mutateAsync(pendingAvatarFile);
        setPendingAvatarFile(null);
        setLocalAvatarPreview(null);
      }
      if (hasProfileFieldChanges) {
        await updateProfile.mutateAsync({
          firstName,
          lastName,
          bio,
          timezone,
        });
      }
      updateForm({ saveState: "saved" });
      addToast("success", tc("profileUpdated"));
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(
        () => updateForm({ saveState: "idle" }),
        2000
      );
    } catch (err) {
      updateForm({ saveState: "error" });
      requestAnimationFrame(() => saveButtonRef.current?.focus());
      addToast(
        "error",
        err instanceof Error ? err.message : tc("error")
      );
    }
  };

  const email = profile?.email ?? "";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || email;

  if (isPending) {
    return (
      <div className="max-w-[720px] space-y-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,220px)_1fr]">
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <Skeleton className="size-24 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-text)]">
        {error?.message || tc("error")}
      </div>
    );
  }

  return (
    <m.div variants={containerVariants} initial={reducedMotion ? false : "hidden"} animate="show" className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-10 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <ProfileAvatarSection
          t={t}
          firstName={firstName}
          lastName={lastName}
          displayName={displayName}
          email={email}
          avatarPreview={avatarDisplay}
          fileInputRef={fileInputRef}
          onAvatarChange={handleAvatarChange}
          onRemoveAvatar={handleRemoveAvatar}
        />

        <div className="min-w-0 space-y-6">
          <ProfileFieldsSection
            t={t}
            firstName={firstName}
            lastName={lastName}
            email={email}
            bio={bio}
            timezone={timezone}
            updateForm={updateForm}
          />
          <div className="border-t border-[var(--border-dim)] pt-5">
            <p className="mb-2 text-xs font-medium tracking-wide text-[var(--text-secondary)]">Idioma</p>
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      <m.div
        variants={itemVariants}
        className="flex justify-end border-t border-[var(--border-dim)] pt-6"
      >
        <button
          ref={saveButtonRef}
          type="button"
          onClick={handleSave}
          aria-busy={saveState === "saving"}
          disabled={
            !hasChanges ||
            saveState === "saving" ||
            saveState === "saved" ||
            updateProfile.isPending ||
            uploadAvatar.isPending
          }
          className={cn(
            "flex h-10 items-center gap-2 rounded-md px-5 text-sm font-medium text-[var(--action-primary-text)]",
            "bg-[var(--action-primary-bg)] hover:bg-[var(--action-primary-hover)]",
            "active:scale-[0.98] active:brightness-90",
            "transition-all duration-200",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <ActionStatusIcon
            state={saveState === "saving" ? "pending" : saveState === "saved" ? "success" : saveState === "error" ? "error" : "idle"}
          />
          <span>
            {saveState === "saving"
              ? t("saving")
              : saveState === "saved"
                ? t("saved")
                : saveState === "error"
                  ? tc("retry")
                  : t("saveChanges")}
          </span>
        </button>
      </m.div>
    </m.div>
  );
}

function ProfileAvatarSection({
  t,
  firstName,
  lastName,
  displayName,
  email,
  avatarPreview,
  fileInputRef,
  onAvatarChange,
  onRemoveAvatar,
}: {
  t: (key: string) => string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  avatarPreview: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
}) {
  return (
    <m.div
      variants={itemVariants}
      className="flex flex-col items-center gap-3 lg:items-start lg:pt-1"
    >
      <div className="group relative">
        <div
          className={cn(
            "flex size-24 items-center justify-center rounded-full text-2xl font-semibold",
            "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
            "ring-2 ring-[var(--border-medium)]",
            avatarPreview ? "overflow-hidden" : ""
          )}
        >
          {avatarPreview ? (
            <m.img
              key={avatarPreview}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              src={avatarPreview}
              alt={`${firstName} ${lastName}`.trim() || t("changeAvatar")}
              className="size-full object-cover"
            />
          ) : (
            <span>
              {firstName[0]}
              {lastName[0]}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t("changeAvatar")}
          className={cn(
            "absolute inset-0 flex cursor-pointer items-center justify-center rounded-full",
            "bg-[color-mix(in_oklch,var(--text-primary)_45%,transparent)] opacity-0 group-hover:opacity-100",
            "transition-opacity duration-200"
          )}
        >
          <Camera size={20} className="text-[var(--text-on-accent)]" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          aria-label={t("changeAvatar")}
          accept="image/jpeg,image/png"
          onChange={onAvatarChange}
          className="hidden"
        />
      </div>

      <div className="text-center lg:text-left">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{displayName}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{email}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-sm font-medium text-[var(--selection-text)] hover:underline"
        >
          {t("changeAvatar")}
        </button>
        {avatarPreview && (
          <button
            type="button"
            onClick={onRemoveAvatar}
            className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--danger-text)]"
          >
            {t("remove")}
          </button>
        )}
      </div>
    </m.div>
  );
}

function ProfileFieldsSection({
  t,
  firstName,
  lastName,
  email,
  bio,
  timezone,
  updateForm,
}: {
  t: (key: string) => string;
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  timezone: string;
  updateForm: (payload: Partial<ProfileFormState>) => void;
}) {
  return (
    <m.div variants={itemVariants} className="space-y-5">
      <div>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t("profile.accountDetails")}
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="profile-first-name"
              className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]"
            >
              {t("firstName")}
            </label>
            <input
              id="profile-first-name"
              type="text"
              value={firstName}
              onChange={(e) => updateForm({ firstName: e.target.value })}
              placeholder={t("profile.namePlaceholder")}
              className={fieldClass}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="profile-last-name"
              className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]"
            >
              {t("lastName")}
            </label>
            <input
              id="profile-last-name"
              type="text"
              value={lastName}
              onChange={(e) => updateForm({ lastName: e.target.value })}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
          <label
            htmlFor="profile-email"
            className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]"
          >
            {t("emailAddress")}
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            readOnly
            disabled
            placeholder={t("profile.emailPlaceholder")}
            className={readOnlyFieldClass}
          />
          <p className="text-xs text-[var(--text-muted)]">{t("emailVerificationNote")}</p>
        </div>

        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
          <label
            htmlFor="profile-timezone"
            className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]"
          >
            {t("timeZone")}
          </label>
          <select
            id="profile-timezone"
            value={timezone}
            onChange={(e) => updateForm({ timezone: e.target.value })}
            className={cn(fieldClass, "cursor-pointer appearance-none")}
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
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="profile-bio"
          className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]"
        >
          {t("bioRole")}
        </label>
        <textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => updateForm({ bio: e.target.value })}
          placeholder={t("profile.bioPlaceholder")}
          rows={3}
          className={cn(
            fieldClass,
            "h-auto min-h-[5.5rem] resize-y py-2"
          )}
        />
      </div>
    </m.div>
  );
}
