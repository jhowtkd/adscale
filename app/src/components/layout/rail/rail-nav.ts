// The v4 rail: six destinations, all on routes that already exist (no new route or page).
//   Conversa → /        Buscar → focuses a search field        Criações → /campaigns
//   Biblioteca → /library        Ideias → /ideas        Metas → /goals
// Pipeline is not a rail item: it lives in the Painel | Pipeline selector of the header.

export type RailDestinationId = "conversation" | "creations" | "library" | "ideas" | "goals";

export const RAIL_DESTINATIONS: ReadonlyArray<{ id: RailDestinationId; href: string }> = [
  { id: "conversation", href: "/" },
  { id: "creations", href: "/campaigns" },
  { id: "library", href: "/library" },
  { id: "ideas", href: "/ideas" },
  { id: "goals", href: "/goals" },
];

const startsWithSegment = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Which rail destination a route belongs to; null for routes the rail does not list (settings, docs, pipeline…). */
export function railDestinationFor(pathname: string): RailDestinationId | null {
  if (pathname === "/" || startsWithSegment(pathname, "/assistant")) return "conversation";
  // The creation tools keep their routes; they sit under Criações.
  if (["/campaigns", "/creative-work", "/quick-tools", "/templates"].some((base) => startsWithSegment(pathname, base))) return "creations";
  if (startsWithSegment(pathname, "/library")) return "library";
  if (startsWithSegment(pathname, "/ideas")) return "ideas";
  if (startsWithSegment(pathname, "/goals")) return "goals";
  return null;
}

/** Painel is the default view of every screen; Pipeline is its own. */
export function viewFor(pathname: string): "painel" | "pipeline" {
  return startsWithSegment(pathname, "/pipeline") ? "pipeline" : "painel";
}

/** The destinations that carry the chosen `?account=` along, like the screens that read it. */
export const ACCOUNT_AWARE_HREFS: ReadonlySet<string> = new Set(["/ideas", "/goals", "/pipeline"]);
