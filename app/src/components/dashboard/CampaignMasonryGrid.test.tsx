import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CampaignMasonryGrid, {
  CampaignMasonryGridItem,
  campaignMasonryGridClassName,
  campaignMasonryItemClassName,
} from "./CampaignMasonryGrid";

describe("CampaignMasonryGrid", () => {
  it("renders a multi-column masonry container", () => {
    render(
      <CampaignMasonryGrid>
        <CampaignMasonryGridItem>
          <article>Card A</article>
        </CampaignMasonryGridItem>
        <CampaignMasonryGridItem>
          <article>Card B</article>
        </CampaignMasonryGridItem>
      </CampaignMasonryGrid>,
    );

    const grid = screen.getByTestId("campaign-masonry-grid");
    expect(grid).toHaveClass("columns-1");
    expect(grid).toHaveClass("sm:columns-2");
    expect(grid).toHaveClass("xl:columns-3");
    expect(grid).toHaveClass("2xl:columns-4");
    expect(grid.className).toContain("[column-gap:1.25rem]");
    expect(screen.getByText("Card A").parentElement).toHaveClass("break-inside-avoid");
  });

  it("exports shared masonry class names for skeleton reuse", () => {
    expect(campaignMasonryGridClassName).toContain("columns-1");
    expect(campaignMasonryItemClassName).toContain("break-inside-avoid");
  });
});
