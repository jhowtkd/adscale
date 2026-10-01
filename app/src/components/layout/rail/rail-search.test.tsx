import { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/library";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

import { RailSearchProvider, useRailSearch, useRailSearchTarget } from "./rail-search";

function Page({ field = true }: { field?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useRailSearchTarget(ref);
  return field ? <input ref={ref} aria-label="campo da página" /> : <p>sem campo</p>;
}

function Trigger() {
  const search = useRailSearch();
  return <button onClick={() => search?.request()}>buscar</button>;
}

describe("rail search", () => {
  beforeEach(() => {
    push.mockClear();
    pathname = "/library";
  });
  afterEach(() => vi.useRealTimers());

  it("focuses the search field the page offers", () => {
    render(<RailSearchProvider><Trigger /><Page /></RailSearchProvider>);
    fireEvent.click(screen.getByRole("button", { name: "buscar" }));
    expect(screen.getByLabelText("campo da página")).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("without a field, leads to the conversation and focuses the field once it appears", () => {
    const { rerender } = render(<RailSearchProvider><Trigger /><Page field={false} /></RailSearchProvider>);
    fireEvent.click(screen.getByRole("button", { name: "buscar" }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/");
    rerender(<RailSearchProvider><Trigger /><Page field /></RailSearchProvider>);
    expect(screen.getByLabelText("campo da página")).toHaveFocus();
  });

  it("does not navigate when the page is already the conversation", () => {
    pathname = "/";
    render(<RailSearchProvider><Trigger /><Page field={false} /></RailSearchProvider>);
    fireEvent.click(screen.getByRole("button", { name: "buscar" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("forgets a request the next page took too long to answer, so a late field does not steal focus", () => {
    vi.useFakeTimers();
    const { rerender } = render(<RailSearchProvider><Trigger /><Page field={false} /></RailSearchProvider>);
    fireEvent.click(screen.getByRole("button", { name: "buscar" }));
    act(() => { vi.advanceTimersByTime(5_000); });
    rerender(<RailSearchProvider><Trigger /><Page field /></RailSearchProvider>);
    expect(screen.getByLabelText("campo da página")).not.toHaveFocus();
  });

  it("consumes the request: a field registered afterwards is not focused again", () => {
    const { rerender } = render(<RailSearchProvider><Trigger /><Page field={false} /></RailSearchProvider>);
    fireEvent.click(screen.getByRole("button", { name: "buscar" }));
    rerender(<RailSearchProvider><Trigger /><Page field /></RailSearchProvider>);
    screen.getByLabelText("campo da página").blur();
    rerender(<RailSearchProvider><Trigger /><Page field={false} /></RailSearchProvider>);
    rerender(<RailSearchProvider><Trigger /><Page field /></RailSearchProvider>);
    expect(screen.getByLabelText("campo da página")).not.toHaveFocus();
  });

  it("outside the rail shell the hook does nothing and there is no search to call", () => {
    render(<Page />);
    expect(screen.getByLabelText("campo da página")).not.toHaveFocus();
    function Probe() {
      return <span data-testid="probe">{String(useRailSearch())}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("null");
  });
});
