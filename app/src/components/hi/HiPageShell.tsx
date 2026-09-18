import { HiFallback } from "@/components/hi/HiFallback";

/**
 * Integration slot for the interactive visitor island (#440).
 *
 * Contract for #440: replace this stub's body with the visitor island
 * (request form, protocol picker, examples, local draft commit). The slot
 * keeps the same guarantees the route shell relies on: public render, no
 * fetch of brands/works/campaigns/billing, single landmark, skip-link
 * target `#hi-main`, no redirect to `/`.
 *
 * Until #440 lands, renders the fallback — `HI_PAGE_ENABLED=true` without
 * the island would otherwise strand visitors on an empty page.
 */
export function HiPageShell() {
  return <HiFallback />;
}
