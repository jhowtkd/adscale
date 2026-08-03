"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import Panel from "@/components/layout/Panel";

type TesterProfile = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  ownerEmail: string;
  ownerName: string | null;
  notes: string | null;
  grantedByEmail: string | null;
  expiresAt: string | null;
  createdAt: string;
};

async function fetchTesters() {
  const res = await apiFetch("/api/admin/testers");
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as { testers: TesterProfile[] };
}

export function TesterProfilesPanel() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-testers"],
    queryFn: fetchTesters,
    retry: false,
  });

  const grantMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/admin/testers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((payload.error as string | undefined) ?? "grant failed");
      }
      return payload;
    },
    onSuccess: () => {
      setEmail("");
      setNotes("");
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["admin-testers"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "grant failed");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiFetch(`/api/admin/testers/${workspaceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error((payload.error as string | undefined) ?? "revoke failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-testers"] });
    },
  });

  if (query.error instanceof Error && query.error.message === "forbidden") {
    return null;
  }

  const testers = query.data?.testers ?? [];

  return (
    <Panel padding="md" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Perfis tester</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Concede uso ilimitado sem assinatura ou compra de créditos para o workspace do usuário.
        </p>
      </div>

      <form
        className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          grantMutation.mutate();
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email@exemplo.com"
          required
          className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
        />
        <input
          type="text"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notas (opcional)"
          className="h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm"
        />
        <Button type="submit" disabled={grantMutation.isPending || !email.trim()}>
          {grantMutation.isPending ? "Salvando..." : "Adicionar tester"}
        </Button>
      </form>

      {errorMessage ? <p className="text-sm text-[var(--danger-text)]">{errorMessage}</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--text-muted)]">
            <tr>
              <th className="px-2 py-2 font-medium">Usuário</th>
              <th className="px-2 py-2 font-medium">Workspace</th>
              <th className="px-2 py-2 font-medium">Notas</th>
              <th className="px-2 py-2 font-medium">Desde</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {testers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-[var(--text-muted)]">
                  Nenhum perfil tester cadastrado.
                </td>
              </tr>
            ) : (
              testers.map((tester) => (
                <tr key={tester.id} className="border-t border-[var(--border-dim)]">
                  <td className="px-2 py-3">
                    <div className="font-medium text-[var(--text-primary)]">{tester.ownerEmail}</div>
                    {tester.ownerName ? (
                      <div className="text-xs text-[var(--text-muted)]">{tester.ownerName}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-3">
                    <div>{tester.workspaceName}</div>
                    <div className="text-xs text-[var(--text-muted)]">{tester.workspaceSlug}</div>
                  </td>
                  <td className="px-2 py-3 text-[var(--text-secondary)]">{tester.notes ?? "—"}</td>
                  <td className="px-2 py-3 text-[var(--text-secondary)]">
                    {new Date(tester.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(tester.workspaceId)}
                    >
                      Remover
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
