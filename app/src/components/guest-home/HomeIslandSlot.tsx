import LocalPublicHomeFallback from "@/components/guest-home/LocalPublicHomeFallback";

/**
 * Temporary integration slot for the interactive visitor island (#440).
 *
 * Contract for #440: replace this stub with the copied `AdscaleGuestHome`
 * island (request form, protocol picker, examples, local draft commit),
 * keeping the route shell guarantees: public render, no fetch of
 * brands/works/campaigns/billing, single `<main id="main">` landmark
 * pointed at by the global skip link, no redirect to `/`.
 *
 * Until #440 lands, renders the fallback — `homeEnabled` without the
 * island would otherwise strand visitors on an empty page.
 */
export function HomeIslandSlot() {
  return <LocalPublicHomeFallback />;
}
