"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ownerButtonClass } from "@/components/feedback/owner-chrome";

type AdminInspiration = {
  id: string;
  title: string;
  filename: string;
  previewUrl: string;
  createdAt: string;
};

async function fetchInspirations(): Promise<AdminInspiration[] | null> {
  const response = await apiFetch("/api/admin/inspirations");
  if (response.status === 403) return null;
  if (!response.ok) throw new Error("Não foi possível carregar as inspirações.");
  const payload = await response.json() as { inspirations?: AdminInspiration[] };
  return payload.inspirations ?? [];
}

export function AdminInspirationsPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin-inspirations"],
    queryFn: fetchInspirations,
    retry: false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-inspirations"] });
    void queryClient.invalidateQueries({ queryKey: ["creative-work", "inspirations"] });
  };

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        const response = await apiFetch("/api/admin/inspirations", {
          method: "POST",
          body: formData,
          timeoutMs: 60_000,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error ?? `Falha ao enviar ${file.name}.`);
        }
      }
    },
    onSuccess: () => {
      setErrorMessage(null);
    },
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : "Falha no upload."),
    onSettled: () => {
      if (inputRef.current) inputRef.current.value = "";
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/admin/inspirations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível remover a inspiração.");
    },
    onSuccess: () => {
      setErrorMessage(null);
      refresh();
    },
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : "Falha ao remover."),
  });

  if (query.data === null) return null;
  const inspirations = query.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Inspirações globais</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            As imagens aparecem na área de inspirações para qualquer usuário usar como referência de reestyling.
          </p>
        </div>
        <label className={`${ownerButtonClass} cursor-pointer`}>
          <ImagePlus size={16} aria-hidden="true" />
          {upload.isPending ? "Enviando..." : "Adicionar imagens"}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={upload.isPending}
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) upload.mutate(files);
            }}
          />
        </label>
      </div>

      {errorMessage ? <p role="alert" className="text-sm text-[var(--danger-text)]">{errorMessage}</p> : null}
      {query.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--danger-text)]"
        >
          <span>Não foi possível carregar as inspirações.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : query.isLoading ? (
        <p role="status" className="text-sm text-[var(--text-muted)]">Carregando inspirações...</p>
      ) : inspirations.length === 0 ? (
        <p className="rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)] p-4 text-sm text-[var(--text-muted)]">
          Nenhuma inspiração global cadastrada.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {inspirations.map((inspiration) => (
            <article key={inspiration.id} className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              <div
                role="img"
                aria-label={inspiration.title}
                className="aspect-[4/3] bg-[var(--surface-inset)] bg-cover bg-center"
                style={{ backgroundImage: `url(${inspiration.previewUrl})` }}
              />
              <div className="flex items-center gap-2 p-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
                  {inspiration.title}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover inspiração ${inspiration.title}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Remover “${inspiration.title}” da galeria?`)) {
                      remove.mutate(inspiration.id);
                    }
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {query.dataUpdatedAt > 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Atualizado às {new Date(query.dataUpdatedAt).toLocaleTimeString()}
        </p>
      ) : null}
    </div>
  );
}
