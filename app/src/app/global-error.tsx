"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <main
          style={{
            maxWidth: "28rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignItems: "center",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Algo deu errado
          </h1>
          <p style={{ margin: 0, color: "#a1a1a1", lineHeight: 1.5 }}>
            Ocorreu um erro inesperado e nossa equipe já foi notificada. Você
            pode tentar novamente.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "8px",
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              backgroundColor: "#00b34a",
              color: "#0a0a0a",
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
