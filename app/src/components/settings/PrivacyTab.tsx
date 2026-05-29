"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Trash2, AlertTriangle, Shield, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

export default function PrivacyTab() {
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    try {
      const res = await apiFetch("/api/user/export");
      if (!res.ok) throw new Error("Failed to export data");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adscale-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Erro ao exportar dados. Tente novamente.");
    }
  }

  async function handleDelete() {
    if (confirmText !== "DELETE") {
      setError('Digite "DELETE" para confirmar.');
      return;
    }
    setError("");
    setDeleting(true);
    try {
      const res = await apiFetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) throw new Error("Failed to delete account");
      window.location.href = "/";
    } catch {
      setError("Erro ao excluir conta. Tente novamente.");
      setDeleting(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Data Export */}
      <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Download size={18} className="text-[var(--accent-green)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Exportar meus dados
          </h3>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Baixe uma copia completa dos seus dados pessoais em formato JSON.
          Inclui campanhas, derivacoes, assets e planos criativos.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--deep-bg)]"
        >
          <Download size={16} />
          Exportar dados (JSON)
        </button>
      </div>

      {/* Legal Links */}
      <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-[var(--accent-green)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Documentos legais
          </h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/privacy"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm text-[var(--text-primary)] transition-all hover:bg-[var(--deep-bg)]"
          >
            <Shield size={16} />
            Politica de Privacidade
          </Link>
          <Link
            href="/terms"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm text-[var(--text-primary)] transition-all hover:bg-[var(--deep-bg)]"
          >
            <FileText size={16} />
            Termos de Uso
          </Link>
        </div>
      </div>

      {/* Account Deletion */}
      <div className="rounded-lg border border-[var(--status-rose-bg)] bg-[var(--status-rose-bg)]/10 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Trash2 size={18} className="text-[var(--accent-rose)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Excluir conta
          </h3>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Esta acao ira remover permanentemente todas as suas campanhas, imagens e dados.
          Seus dados pessoais serao anonimizados nos termos da LGPD.
        </p>
        {!showDeleteDialog ? (
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--accent-rose)] bg-[var(--accent-rose)]/10 px-4 text-sm font-medium text-[var(--accent-rose)] transition-all hover:bg-[var(--accent-rose)]/20"
          >
            <AlertTriangle size={16} />
            Quero excluir minha conta
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            {error && (
              <div className="rounded-md bg-[var(--accent-rose)]/10 px-3 py-2 text-sm text-[var(--accent-rose)]">
                {error}
              </div>
            )}
            <p className="text-xs text-[var(--text-secondary)]">
              Para confirmar, digite <strong>DELETE</strong> no campo abaixo:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="h-9 w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-rose)]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setConfirmText("");
                  setError("");
                }}
                className="h-9 flex-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--deep-bg)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="h-9 flex-1 rounded-md bg-[var(--accent-rose)] text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60"
              >
                {deleting ? "Excluindo..." : "Confirmar exclusao"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
