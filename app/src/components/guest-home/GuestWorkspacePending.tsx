import Link from "next/link";

/**
 * Recoverable panel when the account has no workspace yet at guest-entry
 * time (#442). The server guard still throws for the normal Studio path —
 * this panel only renders for a guest handoff, preserving the draft and the
 * continuation while the account finishes provisioning. Retry re-runs the
 * same URL (and the same guard); going back keeps the local copy intact.
 */
export function GuestWorkspacePending({
  retryHref,
}: {
  retryHref: string;
}) {
  return (
    <section
      aria-label="Workspace em preparação"
      data-guest-entry="workspace-pending"
      style={{
        padding: 16,
        margin: "12px 0",
        border: "1px solid var(--border-default, #4b3d59)",
        borderRadius: 12,
        background: "var(--surface-raised, #1b1822)",
      }}
    >
      <strong>Seu workspace ainda está sendo preparado.</strong>
      <p style={{ fontSize: 13 }}>
        Seu pedido continua salvo neste navegador. Tente novamente em alguns
        instantes — se o problema persistir, volte à página inicial e entre
        em contato com o suporte.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Link
          href={retryHref}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: "#dfafea",
            color: "#211327",
          }}
        >
          Tentar novamente
        </Link>
        <Link
          href="/hi"
          style={{
            padding: "8px 14px",
            border: "1px solid #766880",
            borderRadius: 10,
          }}
        >
          Voltar à página inicial
        </Link>
      </div>
    </section>
  );
}
