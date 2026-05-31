"use client";

import { useReducer, useRef, useEffect } from "react";
import { m } from "framer-motion";
import { Camera, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { useOnboarding } from "@/lib/hooks/use-onboarding";

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

interface ProfileFormState {
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  timezone: string;
  avatarPreview: string;
  saveState: "idle" | "saving" | "saved";
}

function profileFormReducer(
  state: ProfileFormState,
  payload: Partial<ProfileFormState>
): ProfileFormState {
  return { ...state, ...payload };
}

// ============================================
// Profile Tab
// ============================================

export default function ProfileTab() {
  const profile = useAppStore((s) => s.profile);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [form, updateForm] = useReducer(profileFormReducer, {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    bio: profile.bio,
    timezone: profile.timezone,
    avatarPreview: profile.avatar,
    saveState: "idle" as const,
  });
  const { firstName, lastName, email, bio, timezone, avatarPreview, saveState } = form;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saveTimeoutStore = saveTimeoutRef;
    return () => {
      if (saveTimeoutStore.current) clearTimeout(saveTimeoutStore.current);
    };
  }, []);

  const hasChanges =
    firstName !== profile.firstName ||
    lastName !== profile.lastName ||
    email !== profile.email ||
    bio !== profile.bio ||
    timezone !== profile.timezone ||
    avatarPreview !== profile.avatar;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      addToast("error", tc("avatarSizeError"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateForm({ avatarPreview: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const { completed: onboardingCompleted, restart, isRestarting } = useOnboarding();

  const handleSave = async () => {
    updateForm({ saveState: "saving" });
    await new Promise((r) => setTimeout(r, 800));
    updateProfile({
      firstName,
      lastName,
      email,
      bio,
      timezone,
      avatar: avatarPreview,
    });
    updateForm({ saveState: "saved" });
    addToast("success", tc("profileUpdated"));
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => updateForm({ saveState: "idle" }), 2000);
  };

  const handleRestartTour = () => {
    restart();
    addToast("success", tc("tourRestarted"));
  };

  return (
    <m.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-[560px] space-y-6"
    >
      <ProfileAvatarSection
        t={t}
        firstName={firstName}
        lastName={lastName}
        avatarPreview={avatarPreview}
        fileInputRef={fileInputRef}
        onAvatarChange={handleAvatarChange}
        onRemoveAvatar={() => updateForm({ avatarPreview: "" })}
      />

      <ProfileFieldsSection
        t={t}
        firstName={firstName}
        lastName={lastName}
        email={email}
        bio={bio}
        timezone={timezone}
        updateForm={updateForm}
      />

      {/* Onboarding */}
      {onboardingCompleted && (
        <m.div variants={itemVariants} className="space-y-3 pt-4 border-t border-[var(--border-dim)]">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("onboarding.preferences")}</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">{t("onboarding.restartDescription")}</p>
          </div>
          <button type="button"
            onClick={handleRestartTour}
            disabled={isRestarting}
            className={cn(
              "inline-flex items-center gap-2 h-9 px-4 rounded-md text-sm font-medium",
              "border border-[var(--border-dim)] bg-[var(--surface-base)] text-[var(--text-primary)]",
              "hover:bg-[var(--surface-raised)] hover:border-[var(--border-medium)]",
              "transition-all duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RotateCcw size={14} />
            {isRestarting ? t("onboarding.restarting") : t("onboarding.restartTour")}
          </button>
        </m.div>
      )}

      {/* Save Button */}
      <m.div variants={itemVariants} className="flex justify-end pt-2">
        <button type="button"
          onClick={handleSave}
          disabled={!hasChanges || saveState !== "idle"}
          className={cn(
            "h-10 px-5 rounded-md text-sm font-medium text-white flex items-center gap-2",
            "bg-[var(--accent-green)] hover:bg-[var(--accent-green-light)]",
            "active:scale-[0.98] active:brightness-90",
            "transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {saveState === "saving" && (
            <m.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="size-4 border-2 border-white/30 border-t-white rounded-full"
            />
          )}
          {saveState === "saved" && <Check size={16} />}
          <span>
            {saveState === "saving"
              ? t("saving")
              : saveState === "saved"
                ? t("saved")
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
  avatarPreview,
  fileInputRef,
  onAvatarChange,
  onRemoveAvatar,
}: {
  t: (key: string) => string;
  firstName: string;
  lastName: string;
  avatarPreview: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
}) {
  return (
    <m.div variants={itemVariants} className="flex flex-col items-center gap-3">
      <div className="relative group">
        <div
          className={cn(
            "size-24 rounded-full flex items-center justify-center text-2xl font-semibold",
            "bg-[var(--accent-green-dim)] text-[var(--accent-green)]",
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
              alt="Avatar"
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
          className={cn(
            "absolute inset-0 rounded-full flex items-center justify-center",
            "bg-black/40 opacity-0 group-hover:opacity-100",
            "transition-opacity duration-200 cursor-pointer"
          )}
        >
          <Camera size={20} className="text-white" />
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-sm text-[var(--accent-green)] hover:underline"
        >
          {t("changeAvatar")}
        </button>
        {avatarPreview && (
          <button
            type="button"
            onClick={onRemoveAvatar}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
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
    <>
      <m.div variants={itemVariants} className="space-y-2">
        <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("fullName")}
        </label>
        <input
          type="text"
          aria-label={t("fullName")}
          value={`${firstName} ${lastName}`}
          onChange={(e) => {
            const parts = e.target.value.split(" ");
            updateForm({
              firstName: parts[0] || "",
              lastName: parts.slice(1).join(" ") || "",
            });
          }}
          placeholder={t("profile.namePlaceholder")}
          className={cn(
            "w-full h-10 rounded-md border px-3 text-sm",
            "bg-[var(--surface-base)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)0.15)]",
            "transition-all duration-200 border-[var(--border-dim)]"
          )}
        />
      </m.div>

      <m.div variants={itemVariants} className="space-y-2">
        <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("emailAddress")}
        </label>
        <input
          type="email"
          aria-label={t("emailAddress")}
          value={email}
          onChange={(e) => updateForm({ email: e.target.value })}
          placeholder={t("profile.emailPlaceholder")}
          className={cn(
            "w-full h-10 rounded-md border px-3 text-sm",
            "bg-[var(--surface-base)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
            "transition-all duration-200 border-[var(--border-dim)]"
          )}
        />
        <p className="text-xs text-[var(--text-muted)]">
          {t("emailVerificationNote")}
        </p>
      </m.div>

      <m.div variants={itemVariants} className="space-y-2">
        <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("bioRole")}
        </label>
        <textarea
          aria-label={t("bioRole")}
          value={bio}
          onChange={(e) => updateForm({ bio: e.target.value })}
          placeholder={t("profile.bioPlaceholder")}
          rows={3}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-sm resize-none",
            "bg-[var(--surface-base)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
            "transition-all duration-200 border-[var(--border-dim)]"
          )}
        />
      </m.div>

      <m.div variants={itemVariants} className="space-y-2">
        <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("timeZone")}
        </label>
        <select
          value={timezone}
          onChange={(e) => updateForm({ timezone: e.target.value })}
          className={cn(
            "w-full h-10 rounded-md border px-3 text-sm",
            "bg-[var(--surface-base)] text-[var(--text-primary)]",
            "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
            "transition-all duration-200 border-[var(--border-dim)]",
            "appearance-none cursor-pointer"
          )}
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
    </>
  );
}
