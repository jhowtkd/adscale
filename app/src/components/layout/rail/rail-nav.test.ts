import { describe, expect, it } from "vitest";
import { ACCOUNT_AWARE_HREFS, RAIL_DESTINATIONS, railDestinationFor, viewFor } from "./rail-nav";

describe("railDestinationFor", () => {
  it.each([
    ["/", "conversation"],
    ["/assistant", "conversation"],
    ["/assistant?threadId=abc", "conversation"],
    ["/assistant/anything/deeper", "conversation"],
    ["/campaigns", "creations"],
    ["/campaigns/123/edit", "creations"],
    ["/creative-work/abc", "creations"],
    ["/quick-tools/create-post", "creations"],
    ["/templates", "creations"],
    ["/library", "library"],
    ["/library/documents", "library"],
    ["/ideas", "ideas"],
    ["/ideas/7", "ideas"],
    ["/goals", "goals"],
    ["/goals/12", "goals"],
  ] as const)("maps %s to %s", (pathname, expected) => {
    // The query string never reaches usePathname; the case above only checks it does not confuse the match.
    expect(railDestinationFor(pathname.split("?")[0])).toBe(expected);
  });

  it.each(["/pipeline", "/settings", "/docs", "/feedback", "/admin/equipe/accounts", "/brand-kit"])(
    "lists no destination for %s",
    (pathname) => {
      expect(railDestinationFor(pathname)).toBeNull();
    },
  );

  it("matches whole segments only, so a longer name does not borrow a destination", () => {
    expect(railDestinationFor("/library-old")).toBeNull();
    expect(railDestinationFor("/ideasx")).toBeNull();
    expect(railDestinationFor("/goalsetting")).toBeNull();
    expect(railDestinationFor("/assistants")).toBeNull();
    expect(railDestinationFor("/campaignsfoo")).toBeNull();
  });
});

describe("viewFor", () => {
  it("is pipeline only under /pipeline", () => {
    expect(viewFor("/pipeline")).toBe("pipeline");
    expect(viewFor("/pipeline/item/3")).toBe("pipeline");
  });

  it("is painel everywhere else, including lookalikes", () => {
    for (const pathname of ["/", "/library", "/ideas", "/assistant", "/pipelines", "/pipeline-old"]) {
      expect(viewFor(pathname)).toBe("painel");
    }
  });
});

describe("RAIL_DESTINATIONS and ACCOUNT_AWARE_HREFS", () => {
  it("lists the five linked destinations in v4 order, on routes that already exist", () => {
    expect(RAIL_DESTINATIONS).toEqual([
      { id: "conversation", href: "/" },
      { id: "creations", href: "/campaigns" },
      { id: "library", href: "/library" },
      { id: "ideas", href: "/ideas" },
      { id: "goals", href: "/goals" },
    ]);
  });

  it("carries the chosen account only to the screens that read it", () => {
    expect([...ACCOUNT_AWARE_HREFS].sort()).toEqual(["/goals", "/ideas", "/pipeline"]);
  });

  it("only points at account-aware hrefs that the rail or the header actually link to", () => {
    const linked = new Set([...RAIL_DESTINATIONS.map((item) => item.href), "/pipeline"]);
    for (const href of ACCOUNT_AWARE_HREFS) expect(linked.has(href)).toBe(true);
  });
});
