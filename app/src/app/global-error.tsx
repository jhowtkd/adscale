"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

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
      <body className="global-error-page">
        <main className="global-error-main">
          <h1 className="global-error-title">Algo deu errado</h1>
          <p className="global-error-message">
            Ocorreu um erro inesperado e nossa equipe já foi notificada. Você
            pode tentar novamente.
          </p>
          <button type="button" className="global-error-button" onClick={() => reset()}>
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
