import Link from "next/link";

/**
 * Local presentation fallback for `/hi` (#439, plan task 2). Server
 * Component: no private hooks, no remote dependencies. Keeps the entry
 * available in the same service during containment — it is not a copy of
 * the old landing page. Uses the landmark pointed at by the global skip
 * link (`#main`); never nests another `<main>`, never redirects to `/`
 * (anti-recursion: the proxy sends unauthenticated `/` here).
 */
export default function LocalPublicHomeFallback() {
  return (
    <main
      id="main"
      data-public-home-mode="fallback"
      className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center gap-5 px-6 py-16"
    >
      <p className="text-sm tracking-widest">ADSCALE</p>
      <h1 className="text-3xl font-semibold">Seu Estúdio continua por aqui.</h1>
      <p>Entre na sua conta para continuar seus trabalhos.</p>
      <Link
        href="/login?callbackUrl=%2F"
        className="w-fit rounded-lg border px-5 py-3 focus-visible:outline focus-visible:outline-2"
      >
        Entrar no Estúdio
      </Link>
    </main>
  );
}
