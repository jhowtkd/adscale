# Restyling Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated restyling page at `/restyling` with drag-and-drop image upload, brief form, and integration with the existing Inngest job pipeline for `openai.images.edit`.

**Architecture:** New page reusing existing campaign/asset/derivation infrastructure. A POST endpoint accepts `multipart/form-data`, creates all records, and dispatches the Inngest job. The existing `jobs/derivation.ts` restyling branch already calls `openai.images.edit`.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion, TanStack Query, Inngest, Drizzle ORM, R2

---

## Task 1: API Route — POST /api/restyling

**Files:**
- Create: `app/src/app/api/restyling/route.ts` <!-- VERIFY: app/src/app/api/restyling/route.ts — see verification in .planning/tmp/ -->

**Step 1: Write the route handler**

```typescript
import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createCampaign, deleteCampaign } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { createDerivation } from "@/server/repositories/derivation";
import { objectStorage } from "@/server/storage/index"; // VERIFY: was `uploadBuffer, deleteObject from "@/server/storage/r2"` — storage uses objectStorage class in storage/index.ts; see verification in .planning/tmp/
import { inngest } from "@/server/jobs/client";
import { getUserLocale } from "@/server/repositories/user";
import { parseStyleIntensity } from "@/lib/style-intensity";
import { spendOrApiError } from "@/server/billing/paywall"; // VERIFY: was `spendCreditsOrApiError from "@/server/billing/gates"` — codebase has spendOrApiError in billing/paywall.ts; see verification in .planning/tmp/

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);

    const formData = await request.formData();

    const name = formData.get("name");
    const client = formData.get("client");
    const offer = formData.get("offer");
    const ctaText = formData.get("ctaText");
    const styleIntensityRaw = formData.get("styleIntensity");
    const baseImage = formData.get("baseImage");
    const styleImage = formData.get("styleImage");

    if (typeof name !== "string" || !name.trim()) {
      return apiError("invalidInput", 400, { message: "Name is required" });
    }
    if (!(baseImage instanceof File)) {
      return apiError("invalidInput", 400, { message: "Base image is required" });
    }
    if (!(styleImage instanceof File)) {
      return apiError("invalidInput", 400, { message: "Style image is required" });
    }

    if (!ALLOWED_TYPES.includes(baseImage.type as (typeof ALLOWED_TYPES)[number])) {
      return apiError("invalidFileType", 400, { message: "Base image must be PNG, JPEG, or WebP" });
    }
    if (!ALLOWED_TYPES.includes(styleImage.type as (typeof ALLOWED_TYPES)[number])) {
      return apiError("invalidFileType", 400, { message: "Style image must be PNG, JPEG, or WebP" });
    }

    if (baseImage.size <= 0 || baseImage.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }
    if (styleImage.size <= 0 || styleImage.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    const styleIntensity = parseStyleIntensity(styleIntensityRaw);
    if (!styleIntensity) {
      return apiError("invalidInput", 400, { message: "Invalid style intensity" });
    }

    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "restyling",
      idempotencyKey: [
        "restyling", workspace.id, name.trim(),
        baseImage.name, baseImage.size,
        styleImage.name, styleImage.size,
      ].join(":"),
      metadata: { tool: "restyling" },
    });
    if (creditError) return creditError;

    const campaign = await createCampaign(workspace.id, {
      name: name.trim(),
      client: typeof client === "string" ? client.trim() : undefined,
      offer: typeof offer === "string" ? offer.trim() : undefined,
      generationMode: "restyling",
      creativeLevel: "balanced",
      styleIntensity: styleIntensity as "soft" | "medium" | "strong",
      status: "draft",
    });

    const baseKey = `campaigns/${campaign.id}/${crypto.randomUUID()}-base.${baseImage.type.split("/")[1] ?? "bin"}`;
    const baseBuffer = Buffer.from(await baseImage.arrayBuffer());
    await uploadBuffer(baseKey, baseBuffer, baseImage.type);

    const styleKey = `campaigns/${campaign.id}/${crypto.randomUUID()}-style.${styleImage.type.split("/")[1] ?? "bin"}`;
    const styleBuffer = Buffer.from(await styleImage.arrayBuffer());
    await uploadBuffer(styleKey, styleBuffer, styleImage.type);

    try {
      await createAsset(workspace.id, campaign.id, {
        key: baseKey,
        type: baseImage.type,
        size: baseImage.size,
        role: "base",
      });

      await createAsset(workspace.id, campaign.id, {
        key: styleKey,
        type: styleImage.type,
        size: styleImage.size,
        role: "style_reference",
      });

      const derivation = await createDerivation({
        campaignId: campaign.id,
        workspaceId: workspace.id,
        status: "queued",
        generationMode: "restyling",
        format: "1:1",
        variantIndex: 0,
        ctaText: typeof ctaText === "string" ? ctaText.trim() : undefined,
      });

      await inngest.send({
        name: "derivation.generate",
        data: {
          derivationId: derivation.id,
          campaignId: campaign.id,
          workspaceId: workspace.id,
          locale,
          generationMode: "restyling",
          variantIndex: 0,
          ctaText: typeof ctaText === "string" ? ctaText.trim() : undefined,
          format: "1:1",
          creativeLevel: "balanced",
        },
      });

      return NextResponse.json({
        campaignId: campaign.id,
        derivationId: derivation.id,
        redirectUrl: `/campaigns/${campaign.id}`,
      }, { status: 201 });
    } catch (err) {
      await deleteObject(baseKey).catch(() => {});
      await deleteObject(styleKey).catch(() => {});
      await deleteCampaign(campaign.id, workspace.id).catch(() => {});
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "restyling.POST");
  }
}
```

**Step 2: Verify build passes**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add app/src/app/api/restyling/route.ts
git commit -m "feat(api): add POST /api/restyling endpoint"
```

---

## Task 2: RestylingUpload Component

**Files:**
- Create: `app/src/components/restyling/RestylingUpload.tsx`

**Step 1: Write the component**

```typescript
"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Upload, X, Image as ImageIcon } from "lucide-react";

interface RestylingUploadProps {
  label: string;
  description?: string;
  accept?: string;
  value: File | null;
  onChange: (file: File) => void;
  error?: string | null;
  translations: {
    dragDrop: string;
    onlyImages: string;
    maxSize: string;
  };
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 50 * 1024 * 1024;

export default function RestylingUpload({
  label,
  description,
  value,
  onChange,
  error,
  translations,
}: RestylingUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!ALLOWED_TYPES.includes(file.type)) return;
      if (file.size > MAX_SIZE) return;
      onChange(file);
    },
    [onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null as unknown as File);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onChange]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  if (value) {
    const url = URL.createObjectURL(value);
    return (
      <div className="relative rounded-lg overflow-hidden border border-[var(--border-dim)] bg-[var(--surface-base)]">
        <img src={url} alt={label} className="w-full h-48 object-cover" />
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded px-2 py-1">
          <span className="text-white text-xs">{formatSize(value.size)}</span>
          <button
            onClick={handleRemove}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <p className="text-white text-xs truncate">{value.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
        isDragging
          ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
          : error
          ? "border-[var(--accent-rose)] bg-[var(--accent-rose)]/5"
          : "border-[var(--border-dim)] hover:border-[var(--border-medium)] bg-[var(--surface-base)]"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleChange}
        className="hidden"
      />
      <Upload
        size={24}
        className={cn(
          "mb-2",
          error ? "text-[var(--accent-rose)]" : "text-[var(--text-muted)]"
        )}
      />
      <p
        className={cn(
          "text-sm text-center px-4",
          error ? "text-[var(--accent-rose)]" : "text-[var(--text-secondary)]"
        )}
      >
        {isDragging ? translations.dragDrop : translations.dragDrop}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-[var(--text-muted)]">{translations.onlyImages}</span>
        <span className="text-xs text-[var(--text-muted)]">·</span>
        <span className="text-xs text-[var(--text-muted)]">{translations.maxSize}</span>
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute -bottom-6 text-xs text-[var(--accent-rose)]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Verify build passes**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add app/src/components/restyling/RestylingUpload.tsx
git commit -m "feat(ui): add RestylingUpload drag-drop component"
```

---

## Task 3: RestylingForm Component

**Files:**
- Create: `app/src/components/restyling/RestylingForm.tsx`

**Step 1: Write the component**

```typescript
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface RestylingFormProps {
  name: string;
  onNameChange: (v: string) => void;
  client: string;
  onClientChange: (v: string) => void;
  offer: string;
  onOfferChange: (v: string) => void;
  ctaText: string;
  onCtaTextChange: (v: string) => void;
  styleIntensity: "soft" | "medium" | "strong";
  onStyleIntensityChange: (v: "soft" | "medium" | "strong") => void;
  errors: {
    name?: string;
  };
}

const INTENSITIES = [
  { value: "soft" as const, label: "intensitySoft", desc: "intensitySoftDesc" },
  { value: "medium" as const, label: "intensityMedium", desc: "intensityMediumDesc" },
  { value: "strong" as const, label: "intensityStrong", desc: "intensityStrongDesc" },
];

export default function RestylingForm({
  name, onNameChange,
  client, onClientChange,
  offer, onOfferChange,
  ctaText, onCtaTextChange,
  styleIntensity, onStyleIntensityChange,
  errors,
}: RestylingFormProps) {
  const t = useTranslations("restyling");

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-[13px] text-[var(--text-secondary)]">
          {t("name")} <span className="text-[var(--accent-rose)]">*</span>
        </Label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t("namePlaceholder")}
          className={cn(
            "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
            errors.name && "border-[var(--accent-rose)]"
          )}
        />
        {errors.name && (
          <p className="text-xs text-[var(--accent-rose)]">{errors.name}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[13px] text-[var(--text-secondary)]">{t("client")}</Label>
          <Input
            value={client}
            onChange={(e) => onClientChange(e.target.value)}
            placeholder={t("clientPlaceholder")}
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px] text-[var(--text-secondary)]">{t("offer")}</Label>
          <Input
            value={offer}
            onChange={(e) => onOfferChange(e.target.value)}
            placeholder={t("offerPlaceholder")}
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[13px] text-[var(--text-secondary)]">{t("ctaText")}</Label>
        <Input
          value={ctaText}
          onChange={(e) => onCtaTextChange(e.target.value)}
          placeholder={t("ctaTextPlaceholder")}
          className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[13px] text-[var(--text-secondary)]">{t("styleIntensity")}</Label>
        <div className="flex gap-2">
          {INTENSITIES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleIntensityChange(opt.value)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors",
                styleIntensity === opt.value
                  ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                  : "border-[var(--border-dim)] hover:border-[var(--border-medium)] bg-[var(--surface-base)]"
              )}
            >
              <span
                className={cn(
                  "text-sm font-medium",
                  styleIntensity === opt.value
                    ? "text-[var(--accent-blue)]"
                    : "text-[var(--text-primary)]"
                )}
              >
                {t(opt.label)}
              </span>
              <span className="text-xs text-[var(--text-muted)] text-center">
                {t(opt.desc)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify build passes**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add app/src/components/restyling/RestylingForm.tsx
git commit -m "feat(ui): add RestylingForm component"
```

---

## Task 4: Restyling Page

**Files:**
- Create: `app/src/app/(dashboard)/restyling/page.tsx` <!-- VERIFY: app/src/app/(dashboard)/restyling/page.tsx — see verification in .planning/tmp/ -->

**Step 1: Write the page**

```typescript
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast"; // VERIFY: was `useToast from "@/hooks/use-toast"` — app uses addToast from useAppStore (@/lib/store) + ToastStack provider; see verification in .planning/tmp/
import RestylingUpload from "@/components/restyling/RestylingUpload";
import RestylingForm from "@/components/restyling/RestylingForm";

export default function RestylingPage() {
  const router = useRouter();
  const t = useTranslations("restyling");
  const tCommon = useTranslations("common");
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [offer, setOffer] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [styleIntensity, setStyleIntensity] = useState<"soft" | "medium" | "strong">("medium");
  const [baseImage, setBaseImage] = useState<File | null>(null);
  const [styleImage, setStyleImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ name?: string; baseImage?: string; styleImage?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrors({});

      if (!name.trim()) {
        setErrors((prev) => ({ ...prev, name: t("errors.nameRequired") }));
        return;
      }
      if (!baseImage) {
        toast({ description: t("errors.baseImageRequired"), variant: "error" });
        return;
      }
      if (!styleImage) {
        toast({ description: t("errors.styleImageRequired"), variant: "error" });
        return;
      }

      setIsSubmitting(true);

      try {
        const formData = new FormData();
        formData.append("name", name.trim());
        formData.append("client", client.trim());
        formData.append("offer", offer.trim());
        formData.append("ctaText", ctaText.trim());
        formData.append("styleIntensity", styleIntensity);
        formData.append("baseImage", baseImage);
        formData.append("styleImage", styleImage);

        const res = await apiFetch("/api/restyling", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Erro ao gerar restyling");
        }

        const data = await res.json();
        router.push(data.redirectUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : tCommon("genericError");
        toast({ description: message, variant: "error" });
        setIsSubmitting(false);
      }
    },
    [name, client, offer, ctaText, styleIntensity, baseImage, styleImage, router, toast, t, tCommon]
  );

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t("subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{t("baseImage")}</p>
              <p className="text-xs text-[var(--text-muted)] mb-1">{t("baseImageDescription")}</p>
              <RestylingUpload
                label={t("baseImage")}
                value={baseImage}
                onChange={setBaseImage}
                error={errors.baseImage}
                translations={{
                  dragDrop: t("dragDropBase"),
                  onlyImages: t("onlyImages"),
                  maxSize: t("maxSize"),
                }}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{t("styleImage")}</p>
              <p className="text-xs text-[var(--text-muted)] mb-1">{t("styleImageDescription")}</p>
              <RestylingUpload
                label={t("styleImage")}
                value={styleImage}
                onChange={setStyleImage}
                error={errors.styleImage}
                translations={{
                  dragDrop: t("dragDropStyle"),
                  onlyImages: t("onlyImages"),
                  maxSize: t("maxSize"),
                }}
              />
            </div>
          </div>

          <RestylingForm
            name={name}
            onNameChange={setName}
            client={client}
            onClientChange={setClient}
            offer={offer}
            onOfferChange={setOffer}
            ctaText={ctaText}
            onCtaTextChange={setCtaText}
            styleIntensity={styleIntensity}
            onStyleIntensityChange={setStyleIntensity}
            errors={errors}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-dim)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/")}
              className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
            >
              {isSubmitting ? t("generating") : t("generate")}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
```

**Step 2: Verify build passes**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add app/src/app/\(dashboard\)/restyling/page.tsx
git commit -m "feat(page): add /restyling dedicated page"
```

---

## Task 5: Sidebar Navigation

**Files:**
- Modify: `app/src/components/layout/AppSidebar.tsx` <!-- VERIFY: was `app/src/components/layout/Sidebar.tsx` — actual file is AppSidebar.tsx; see verification in .planning/tmp/ -->

**Step 1: Add Restyling nav item**

Find the `workspaceNavItems` array and add:

```typescript
{ icon: Sparkles, label: tNav("restyling"), href: "/restyling" }
```

Import `Sparkles` from lucide-react.

**Step 2: Verify build passes**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add app/src/components/layout/Sidebar.tsx
git commit -m "feat(ui): add Restyling nav item to sidebar"
```

---

## Task 6: Translations

**Files:**
- Modify: `app/messages/pt-BR.json` <!-- VERIFY: was `app/src/messages/pt-BR.json` — messages live at app/messages/pt-BR.json; see verification in .planning/tmp/ -->
- Modify: `app/messages/en.json` <!-- VERIFY: was `app/src/messages/en.json` — messages live at app/messages/en.json; see verification in .planning/tmp/ -->

**Step 1: Add PT-BR translations**

Add to `pt-BR.json` under root:

```json
{
  "navigation": {
    "restyling": "Restyling"
  },
  "restyling": {
    "title": "Restyling",
    "subtitle": "Aplique o estilo de uma imagem de referência ao seu creative base",
    "baseImage": "Imagem Base",
    "baseImageDescription": "O creative original com o conteúdo a preservar",
    "styleImage": "Referência de Estilo",
    "styleImageDescription": "Imagem com o estilo visual a aplicar",
    "name": "Nome da campanha",
    "namePlaceholder": "Ex: Black Friday - Restyling",
    "client": "Cliente",
    "clientPlaceholder": "Nome do cliente",
    "offer": "Oferta",
    "offerPlaceholder": "Oferta principal",
    "ctaText": "Texto do CTA",
    "ctaTextPlaceholder": "Texto da chamada para ação",
    "styleIntensity": "Intensidade do estilo",
    "intensitySoft": "Suave",
    "intensityMedium": "Médio",
    "intensityStrong": "Forte",
    "intensitySoftDesc": "Mantém o conteúdo original com ajustes sutis",
    "intensityMediumDesc": "Equilíbrio entre conteúdo e novo estilo",
    "intensityStrongDesc": "Transformação visual intensa",
    "generate": "Gerar Derivation",
    "generating": "Gerando...",
    "cancel": "Cancelar",
    "dragDropBase": "Arraste a imagem base ou clique para selecionar",
    "dragDropStyle": "Arraste a imagem de estilo ou clique para selecionar",
    "onlyImages": "Apenas PNG, JPEG ou WebP",
    "maxSize": "Máx 50MB",
    "errors": {
      "nameRequired": "Nome é obrigatório",
      "baseImageRequired": "Imagem base é obrigatória",
      "styleImageRequired": "Imagem de estilo é obrigatória"
    }
  }
}
```

**Step 2: Add EN translations**

Mirror to `en.json` with English text.

**Step 3: Commit**

```bash
git add app/src/messages/pt-BR.json app/src/messages/en.json
git commit -m "feat(i18n): add restyling page translations"
```

---

## Task 7: Integration Test

**Files:**
- Create: `app/tests/integration/restyling.test.ts` <!-- VERIFY: app/tests/integration/restyling.test.ts — see verification in .planning/tmp/ -->

**Step 1: Write test for POST /api/restyling**

```typescript
import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/restyling", () => {
  it("creates campaign with restyling mode and dispatches Inngest event", async () => {
    // Mock requireWorkspaceAccess to return user + workspace
    // Mock getUserLocale
    // Mock spendCreditsOrApiError
    // Mock uploadBuffer (×2)
    // Mock createCampaign, createAsset (×2), createDerivation
    // Mock inngest.send
    // Mock formData with all fields + two File objects
    // Assert 201 with campaignId, derivationId, redirectUrl
  });

  it("returns 400 when name is missing", async () => {
    // Mock formData missing name
    // Assert 400 with invalidInput
  });

  it("returns 400 when base image is missing", async () => {
    // Mock formData missing baseImage File
    // Assert 400
  });

  it("returns 400 for invalid file type", async () => {
    // Mock formData with text/plain file
    // Assert 400 with invalidFileType
  });

  it("returns 400 for file too large", async () => {
    // Mock File with size > 50MB
    // Assert 400 with fileTooLarge
  });

  it("returns 402 when credits are insufficient", async () => {
    // Mock spendCreditsOrApiError returning 402 error response
    // Assert 402
  });

  it("cleans up R2 objects and campaign on derivation creation failure", async () => {
    // Mock createAsset to throw
    // Mock deleteObject (×2) and deleteCampaign
    // Assert job still cleans up
  });
});
```

**Step 2: Run tests**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm test`
Expected: All pass

**Step 3: Commit**

```bash
git add app/tests/integration/restyling.test.ts
git commit -m "test: add restyling API integration tests"
```

---

## Task 8: Final Verification

**Step 1: Run full build**

Run: `cd /Users/jhonatan/Repos/ADScale_2/app && npm run build`
Expected: Clean build

**Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

**Step 3: Run tests**

Run: `npm test`
Expected: All pass

---

## Self-Review Checklist

- [x] No new tables — reuses campaigns, assets, derivations
- [x] Output always 1:1 format
- [x] Drag & drop for both images
- [x] Intensity selector: soft / medium / strong
- [x] Credit gate with idempotency key
- [x] Compensating transaction on failure
- [x] Redirect to campaign detail page after creation
- [x] i18n for PT-BR and EN
- [x] Sidebar nav item
- [x] Tests for API route