"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Camera, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";

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

// ============================================
// Profile Tab
// ============================================

export default function ProfileTab() {
  const profile = useAppStore((s) => s.profile);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [email, setEmail] = useState(profile.email);
  const [bio, setBio] = useState(profile.bio);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setAvatarPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaveState("saving");
    await new Promise((r) => setTimeout(r, 800));
    updateProfile({
      firstName,
      lastName,
      email,
      bio,
      timezone,
      avatar: avatarPreview,
    });
    setSaveState("saved");
    addToast("success", tc("profileUpdated"));
    setTimeout(() => setSaveState("idle"), 2000);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-[560px] space-y-6"
    >
      {/* Avatar Section */}
      <motion.div variants={itemVariants} className="flex flex-col items-center gap-3">
        <div className="relative group">
          <div
            className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center text-2xl font-semibold",
              "bg-[var(--accent-blue-dim)] text-[var(--accent-blue-light)]",
              "ring-2 ring-[var(--border-medium)]",
              avatarPreview ? "overflow-hidden" : ""
            )}
          >
            {avatarPreview ? (
              <motion.img
                key={avatarPreview}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                src={avatarPreview}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>
                {firstName[0]}
                {lastName[0]}
              </span>
            )}
          </div>

          {/* Camera overlay */}
          <button
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
            accept="image/jpeg,image/png"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm text-[var(--accent-blue)] hover:underline"
          >
            {t("changeAvatar")}
          </button>
          {avatarPreview && (
            <button
              onClick={() => setAvatarPreview("")}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
            >
              {t("remove")}
            </button>
          )}
        </div>
      </motion.div>

      {/* Form Fields */}
      <motion.div variants={itemVariants} className="space-y-2">
        <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("fullName")}
        </label>
        <input
          type="text"
          value={`${firstName} ${lastName}`}
          onChange={(e) => {
            const parts = e.target.value.split(" ");
            setFirstName(parts[0] || "");
            setLastName(parts.slice(1).join(" ") || "");
          }}
          placeholder={t("profile.namePlaceholder")}
          className={cn(
            "w-full h-10 rounded-md border px-3 text-sm",
            "bg-[var(--surface-base)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
            "transition-all duration-200 border-[var(--border-dim)]"
          )}
        />
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2">
        <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("emailAddress")}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2">
        <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("bioRole")}
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
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
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2">
        <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("timeZone")}
        </label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
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
      </motion.div>

      {/* Save Button */}
      <motion.div variants={itemVariants} className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saveState !== "idle"}
          className={cn(
            "h-10 px-5 rounded-md text-sm font-medium text-white flex items-center gap-2",
            "bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)]",
            "active:scale-[0.98] active:brightness-90",
            "transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {saveState === "saving" && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
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
      </motion.div>
    </motion.div>
  );
}
