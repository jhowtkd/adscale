"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import { Search, Plus, X, Globe, Camera as Instagram, User, FileText, Palette, ImageIcon, Grid2X2, Star } from "lucide-react";
import type { ClientProfile } from "@/lib/hooks/use-client-profiles";
import type { BrandDocumentJson } from "@/lib/equipe/api";
import DiagnosisDocument, { parseDiagnosisContent } from "@/components/assistant/DiagnosisDocument";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRailSearchTarget } from "@/components/layout/rail/rail-search";
import type { LibraryV6Asset, LibraryV6Filter, LibraryV6Labels } from "./library-v6-types";

type LibraryV6ViewProps = {
  profile?: ClientProfile | null;
  logoImageUrl?: string;
  documents?: BrandDocumentJson[];
  brandLabels?: Record<string, string>;
  originFilter?: string;
  onOriginChange?: (value: string) => void;
  identityOrigins?: { logo?: string; colors?: string[]; fonts?: string[] };
  labels: LibraryV6Labels;
  assets: LibraryV6Asset[];
  shownCount: number;
  totalCount: number;
  isLoading?: boolean;
  interactive?: boolean;
  searchQuery: string;
  onSearchChange?: (value: string) => void;
  activeFilter?: LibraryV6Filter;
  onFilterChange?: (value: LibraryV6Filter) => void;
  dragOver?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  onDropzoneClick?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onUploadClick?: () => void;
  onDeleteAsset?: (id: string, name: string) => void;
  onReplaceAsset?: () => void;
  renderAssetActions?: (asset: LibraryV6Asset) => ReactNode;
  emptyState?: ReactNode;
  useImagePreview?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
};

function averageImageLuminance(image: HTMLImageElement): number | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let luminance = 0;
    let alphaTotal = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha === 0) continue;
      luminance += ((0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255) * alpha;
      alphaTotal += alpha;
    }

    return alphaTotal > 0 ? luminance / alphaTotal : null;
  } catch {
    // Private or cross-origin assets can make canvas reads unavailable.
    return null;
  }
}

function Origin({ source, text }: { source: string; text: string }) {
  const Icon = source === "brand_site" ? Globe : source === "brand_instagram" ? Instagram : User;
  return <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]"><Icon className="size-3" aria-hidden="true" />{text}</span>;
}

const sourceOf = (origin: string) => `brand_${origin === "user" ? "upload" : origin}`;
function IdentityOrigins({ origins = [], label }: { origins?: string[]; label: (source: string) => string }) {
  return <span className="flex flex-wrap gap-2">{[...new Set(origins)].map(origin => <Origin key={origin} source={sourceOf(origin)} text={label(sourceOf(origin))} />)}</span>;
}

function DocumentBody({ value, labels, depth = 0 }: { value: unknown; labels: Record<string, string>; depth?: number }): ReactNode {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value);
    return /^https?:\/\//i.test(text) ? <a href={text} target="_blank" rel="noreferrer" className="break-all underline">{text}</a> : <p className="whitespace-pre-wrap break-words">{text}</p>;
  }
  // ponytail: six nested levels cover diagnosis documents; use a typed renderer if richer documents need more.
  if (depth > 6) return null;
  if (Array.isArray(value)) return value.some(item => item !== null && typeof item === "object")
    ? <div className="space-y-4">{value.map((item, index) => <DocumentBody key={index} value={item} labels={labels} depth={depth + 1} />)}</div>
    : <ul className="list-outside list-disc space-y-3 pl-5">{value.map((item, index) => <li key={index}><DocumentBody value={item} labels={labels} depth={depth + 1} /></li>)}</ul>;
  if (typeof value === "object") return <div className="space-y-4">{Object.entries(value).sort(([a], [b]) => a === "title" ? -1 : b === "title" ? 1 : 0).map(([key, item]) => <section key={key}>{key === "title" && depth > 0 && typeof item === "string" ? <h3 className="font-semibold">{item}</h3> : <><h3 className="mb-1 font-semibold">{labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}</h3><DocumentBody value={item} labels={labels} depth={depth + 1} /></>}</section>)}</div>;
  return null;
}

export default function LibraryV6View({
  labels, assets, shownCount, totalCount, isLoading = false, interactive = true, searchQuery,
  onSearchChange, activeFilter = "all", onFilterChange, dragOver = false, isUploading = false,
  uploadProgress = 0, onDropzoneClick, onDragOver, onDragLeave, onDrop, onUploadClick,
  onDeleteAsset, onReplaceAsset, renderAssetActions, emptyState, useImagePreview = true,
  onLoadMore, isLoadingMore = false, profile, logoImageUrl, documents = [], brandLabels = {},
  originFilter = "all", onOriginChange, identityOrigins,
}: LibraryV6ViewProps) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  // The rail's "Buscar" (pilot shell) focuses this field; outside the rail shell it does nothing.
  const searchRef = useRef<HTMLInputElement>(null);
  useRailSearchTarget(searchRef);
  const selectedDocument = documents.find(document => document.id === documentId);
  // The free diagnosis has a typed reader; any other document keeps the generic one.
  const diagnosisContent = selectedDocument?.kind === "diagnosis" ? parseDiagnosisContent(selectedDocument.content) : null;
  const text = (key: string, fallback: string) => brandLabels[key] ?? fallback;
  const originText = (source: string) => text(source, source === "brand_site" ? "Do site" : source === "brand_instagram" ? "Do Instagram" : "Enviado por você");
  // Only the CURRENT logo lives in the identity card; a replaced logo keeps its row and stays reachable (and deletable) here.
  const isCurrentLogo = (asset: { kind: string; key?: string }) => asset.kind === "logo" && Boolean(profile?.logoAssetKey) && asset.key === profile?.logoAssetKey;
  const images = assets.filter(asset => asset.kind !== "page" && !isCurrentLogo(asset));
  const pages = assets.filter(asset => asset.kind === "page");
  // Without a logoAssetKey the brand has no logo: never promote some logo-kind asset (an old, replaced one) to it.
  const logoUrl = logoImageUrl ?? (profile?.logoAssetKey ? assets.find(asset => asset.key === profile.logoAssetKey)?.imageUrl : undefined);
  const showIdentity = ["all", "identity", "logo"].includes(activeFilter) && Boolean(profile);
  const identityVisible = (origins: string[] = []) => originFilter === "all" || origins.some(origin => sourceOf(origin) === originFilter);
  const filters = [
    { value: "all", label: labels.filterAll, Icon: Grid2X2 },
    { value: "identity", label: text("identity", "Identidade"), Icon: Palette },
    { value: "images", label: text("images", "Imagens"), Icon: ImageIcon },
    { value: "post", label: text("posts", "Posts das redes"), Icon: Instagram },
    { value: "page", label: text("pages", "Páginas do site"), Icon: Globe },
    { value: "documents", label: text("documents", "Documentos"), Icon: FileText },
    { value: "favorite", label: labels.filterFavorite, Icon: Star },
  ] as const;
  const sectionClass = "font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]";
  const controlClass = "rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  return (
    <div className="grid min-h-[calc(100dvh-8rem)] gap-8 lg:grid-cols-[248px_minmax(0,1fr)]" aria-busy={isLoading}>
      <aside aria-label={labels.filtersAria} className="rounded-[24px] border border-[var(--border-subtle)] p-3 lg:sticky lg:top-4 lg:self-start lg:-mt-4 lg:min-h-[calc(100dvh-2rem)]">
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--utility-icon)]" aria-hidden="true" />
          <input ref={searchRef} type="search" placeholder={labels.searchPlaceholder} aria-label={labels.searchAria} value={searchQuery}
            onChange={interactive && onSearchChange ? event => onSearchChange(event.target.value) : undefined} readOnly={!interactive || !onSearchChange}
            className="h-9 w-full rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] pl-8 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
        </div>
        <p className={`${sectionClass} mb-2 px-3`}>{text("type", "Tipo")}</p>
        <div role="radiogroup" aria-label={labels.filtersAria} className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
          {filters.map(({ value, label, Icon }) => <button key={value} type="button" role="radio" aria-checked={activeFilter === value}
            onClick={() => interactive && onFilterChange?.(value)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", activeFilter === value && "bg-[var(--surface-hover)] text-[var(--text-primary)]", value === "favorite" && "mt-1 opacity-75")}>
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />{label}
          </button>)}
        </div>
        {activeFilter !== "favorite" ? <>
          <p className={`${sectionClass} mb-2 mt-6 px-3`}>{labels.originLabel}</p>
          <div role="radiogroup" aria-label={labels.originLabel} className="flex flex-wrap gap-1 lg:flex-col">
            {["all", "brand_site", "brand_instagram", "brand_upload"].map(source => <button key={source} type="button" role="radio" aria-checked={originFilter === source}
              onClick={() => interactive && onOriginChange?.(source)} className={cn("rounded-lg px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", originFilter === source && "bg-[var(--surface-hover)]")}>
              {source === "all" ? <span className="text-xs text-[var(--text-secondary)]">{labels.filterAll}</span> : <Origin source={source} text={originText(source)} />}
            </button>)}
          </div>
        </> : null}
      </aside>
      <div className="min-w-0 space-y-7 pb-8" onDragOver={interactive ? onDragOver : undefined} onDragLeave={interactive ? onDragLeave : undefined} onDrop={interactive ? onDrop : undefined}>
        <p className={`${sectionClass} pt-1`}>{labels.sectionLabel}</p>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold leading-tight sm:text-[28px]">{labels.title}{profile ? ` · ${profile.name}` : ""}</h1>
          <button type="button" onClick={interactive ? onUploadClick : undefined} disabled={isUploading || !profile} className={`${controlClass} flex h-10 items-center gap-3 bg-[var(--text-primary)] text-[var(--surface-base)] disabled:opacity-50`}>
            {isUploading ? `${uploadProgress}%` : text("add", "Adicionar")}<Plus className="size-4" aria-hidden="true" />
          </button>
        </header>
        {showIdentity ? <section className="space-y-3" aria-label={text("identity", "Identidade")}>
          <h2 className={sectionClass}>{text("identity", "Identidade")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {identityVisible(identityOrigins?.logo ? [identityOrigins.logo] : []) ? <div className="flex min-h-[132px] flex-col justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3.5">
              {logoUrl ? <Image src={logoUrl} alt={profile!.name} width={130} height={64} unoptimized className="h-16 w-[130px] rounded-xl object-contain" /> : <p className="py-4 text-sm text-[var(--text-secondary)]">{text("notDefined", "Ainda não definido")}</p>}
              <div className="flex justify-between text-xs"><span>{text("logo", "Logo")}</span><IdentityOrigins origins={identityOrigins?.logo ? [identityOrigins.logo] : []} label={originText} /></div>
            </div> : null}
            {identityVisible(identityOrigins?.colors) ? <div className="flex min-h-[132px] flex-col justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3.5">
              <div className="flex flex-wrap gap-2">{(profile!.brandColors ?? []).map(color => <div key={color}><div className="size-11 rounded-xl border border-white/10" style={{ backgroundColor: /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined }} /><p className="mt-1 font-mono text-[8px] text-[var(--text-muted)]">{color}</p></div>)}</div>
              <div className="flex justify-between text-xs"><span>{text("colors", "Cores")}</span><IdentityOrigins origins={identityOrigins?.colors} label={originText} /></div>
            </div> : null}
            {identityVisible(identityOrigins?.fonts) ? <div className="flex min-h-[132px] flex-col justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3.5">
              <div><p className="text-2xl font-semibold" style={{ fontFamily: profile!.brandFonts?.[0] ? `${profile!.brandFonts[0]}, var(--font-sans)` : undefined }}>{profile!.brandFonts?.[0] ?? text("notDefined", "Ainda não definido")}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{profile!.brandFonts?.slice(1).join(" · ")}</p></div>
              <div className="flex justify-between text-xs"><span>{text("fonts", "Fontes")}</span><IdentityOrigins origins={identityOrigins?.fonts} label={originText} /></div>
            </div> : null}
          </div>
        </section> : null}
        {isLoading ? <p role="status">{labels.previewLoading}</p> : emptyState ? emptyState : images.length ? <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className={sectionClass}>{activeFilter === "post" ? text("posts", "Posts das redes") : activeFilter === "favorite" ? labels.filterFavorite : activeFilter === "identity" ? text("otherLogos", "Outros logos") : text("images", "Imagens")} · {images.length}</h2>{activeFilter === "all" && images.length > 5 ? <button type="button" onClick={() => onFilterChange?.("images")} className="text-xs text-[var(--text-secondary)] underline focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{text("seeAll", "Ver todas")}</button> : null}</div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" data-testid="library-bento">
            {(activeFilter === "all" ? images.slice(0, 5) : images).map(asset => <li key={asset.id} className="min-w-0"><AssetCard asset={asset} labels={labels} interactive={interactive} useImagePreview={useImagePreview} onDelete={onDeleteAsset} onReplace={onReplaceAsset} />
              <div className="mt-1"><Origin source={asset.source} text={originText(asset.source)} /></div>{interactive ? renderAssetActions?.(asset) : null}
            </li>)}
          </ul>
        </section> : null}
        {pages.length ? <section className="space-y-3"><h2 className={sectionClass}>{text("pages", "Páginas do site")}</h2>{pages.map(page => <a key={page.id} href={page.imageUrl} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-sm focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><span className="flex min-w-0 items-center gap-3"><Globe className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{page.name}</span></span><Origin source={page.source} text={originText(page.source)} /></a>)}</section> : null}
        {documents.length && ["all", "documents"].includes(activeFilter) && originFilter === "all" ? <section className="space-y-3"><h2 className={sectionClass}>{text("documents", "Documentos")}</h2>{documents.map(document => <div key={document.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3.5">
          <div className="flex items-center gap-3"><FileText className="size-8 rounded-xl bg-white/5 p-2" aria-hidden="true" /><div><p className="text-sm font-medium">{typeof document.content.title === "string" ? document.content.title : text("diagnosis", "Diagnóstico da marca")} <span className="rounded border border-[var(--border-subtle)] px-1 font-mono text-[9px] text-[var(--text-muted)]">{text("ai", "IA")}</span></p><p className="mt-1 text-xs text-[var(--text-muted)]">{text(document.createdByRole, document.createdByRole)} · {new Date(document.createdAt).toLocaleDateString()} · {text("version", "Versão")} {document.version}</p></div></div>
          <button type="button" className={controlClass} onClick={() => setDocumentId(document.id)}>↗ {text("open", "Abrir")}</button>
        </div>)}</section> : null}
        {!isLoading && !emptyState && activeFilter === "documents" && (!documents.length || originFilter !== "all") ? <section className="space-y-3"><h2 className={sectionClass}>{text("documents", "Documentos")}</h2><p className="text-sm text-[var(--text-muted)]">{text("notDefined", "Ainda não definido")}</p></section> : null}
        {!isLoading && !assets.length && !documents.length && !emptyState && !["documents", "identity"].includes(activeFilter) ? <button type="button" aria-label={labels.dropzoneAria} onClick={interactive ? onDropzoneClick : undefined} className={cn("w-full rounded-2xl border border-dashed border-[var(--border-subtle)] py-16 text-center focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", dragOver && "bg-[var(--selection-bg)]")}><p className="text-sm text-[var(--text-secondary)]">{labels.dropzoneTitle}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{labels.dropzoneHint}</p></button> : null}
        {!isLoading && interactive && shownCount < totalCount ? <button type="button" onClick={onLoadMore} disabled={isLoadingMore} className={`${controlClass} text-[var(--text-muted)]`}>{isLoadingMore ? labels.loadingMore : labels.loadMore}</button> : null}
      </div>
      <Dialog open={Boolean(selectedDocument)} onOpenChange={open => !open && setDocumentId(null)}><DialogContent size="lg" className="p-6"><DialogTitle>{selectedDocument && typeof selectedDocument.content.title === "string" ? selectedDocument.content.title : text("diagnosis", "Diagnóstico da marca")}</DialogTitle><DialogDescription>{text("version", "Versão")} {selectedDocument?.version}</DialogDescription><div className="mt-4 overflow-y-auto text-sm leading-relaxed focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" tabIndex={0}>{diagnosisContent ? <DiagnosisDocument content={diagnosisContent} /> : <DocumentBody value={selectedDocument?.content} labels={brandLabels} />}</div></DialogContent></Dialog>
    </div>
  );
}

function AssetCard({
  asset,
  labels,
  interactive,
  useImagePreview,
  onDelete,
  onReplace,
}: {
  asset: LibraryV6Asset;
  labels: LibraryV6Labels;
  interactive: boolean;
  useImagePreview: boolean;
  onDelete?: (id: string, name: string) => void;
  onReplace?: () => void;
}) {
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "dark" | "no-preview" | "error">(
    useImagePreview && asset.imageUrl ? "loading" : "no-preview",
  );
  const [retryKey, setRetryKey] = useState(0);
  const [measuredSize, setMeasuredSize] = useState<string | null>(null);
  const kindLabel = {
    reference: labels.filterReference,
    logo: labels.filterLogo,
    photo: labels.filterPhoto,
    generated: labels.filterGenerated,
    page: "",
    post: "",
  }[asset.kind];

  const retryPreview = () => {
    if (!asset.imageUrl) return;
    setPreviewState("loading");
    setRetryKey((key) => key + 1);
  };

  const handlePreviewLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.naturalWidth && image.naturalHeight) {
      setMeasuredSize(`${image.naturalWidth}×${image.naturalHeight}`);
    }
    const luminance = averageImageLuminance(image);
    setPreviewState(luminance !== null && luminance < 0.18 ? "dark" : "ready");
  };

  const width = asset.width || 1080;
  const height = asset.height || 1080;
  const dimensionsLabel = asset.dimensionsLabel !== "—" ? asset.dimensionsLabel : measuredSize;
  const roverMeta = [asset.sizeLabel, dimensionsLabel, kindLabel].filter(Boolean).join(" · ");

  return (
    <article
      data-motion-highlight="focus"
      className="group relative overflow-hidden rounded-2xl bg-white/[0.04] transition-[box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-product)] focus-within:shadow-[0_0_0_2px_var(--focus-ring)]"
    >
      <div
        className={cn("relative", !asset.imageUrl && asset.gradient)}
        data-preview-state={previewState}
      >
        {(previewState === "loading" || previewState === "ready" || previewState === "dark") && asset.imageUrl ? (
          <Image
            key={`${asset.id}-${retryKey}`}
            src={asset.imageUrl}
            alt={previewState === "dark" ? `${asset.name} — ${labels.previewDark}` : asset.name}
            width={width}
            height={height}
            className="block aspect-[5/4] h-full w-full object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
            unoptimized
            onLoad={handlePreviewLoad}
            onError={() => setPreviewState("error")}
          />
        ) : previewState === "error" ? (
          <div className="flex aspect-[5/4] flex-col items-center justify-center gap-2 px-3 text-center text-xs text-[var(--text-muted)]">
            <span role="img" aria-label={labels.previewError}>{labels.previewError}</span>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={retryPreview}
                className="rounded border border-[var(--border-default)] px-2 py-1 text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {labels.retryPreview}
              </button>
              {interactive && onReplace ? (
                <button
                  type="button"
                  onClick={onReplace}
                  className="rounded border border-[var(--border-default)] px-2 py-1 text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {labels.replaceAsset}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex aspect-[5/4] items-center justify-center">
            {previewState === "loading" ? (
              <span role="status" aria-label={labels.previewLoading} className="text-xs text-[var(--text-muted)]">
                {labels.previewLoading}
              </span>
            ) : (
              <span role="img" aria-label={labels.previewNoPreview} className="font-mono text-sm font-bold tracking-widest text-[var(--text-muted)]">
                {asset.glyph}
              </span>
            )}
          </div>
        )}

        {previewState === "loading" && asset.imageUrl ? (
          <span role="status" aria-label={labels.previewLoading} className="sr-only">
            {labels.previewLoading}
          </span>
        ) : null}

        {previewState !== "error" ? (
          <div
            data-testid="library-asset-rover"
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-[oklch(0.12_0.003_260)] px-2.5 py-2 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <p className="truncate text-xs font-medium text-[var(--text-primary)]">{asset.name}</p>
            {roverMeta ? (
              <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-secondary)]">{roverMeta}</p>
            ) : null}
            {previewState === "dark" ? (
              <span role="status" aria-label={labels.previewDark} className="mt-1 block text-[10px] text-[var(--text-secondary)]">
                {labels.previewDark}
              </span>
            ) : null}
          </div>
        ) : null}

        {interactive && onDelete ? (
          <button
            type="button"
            aria-label={labels.deleteAsset}
            onClick={() => onDelete(asset.id, asset.name)}
            className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] [@media(hover:none)]:opacity-100"
          >
            <X size={11} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <dl className="sr-only">
        <div><dt>{labels.originLabel}</dt><dd>{asset.source}</dd></div>
        <div><dt>{labels.functionLabel}</dt><dd>{kindLabel}</dd></div>
        <div><dt>{labels.createdLabel}</dt><dd>{asset.createdAtLabel}</dd></div>
      </dl>
    </article>
  );
}
