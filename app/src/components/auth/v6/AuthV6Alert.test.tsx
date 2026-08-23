import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "./AuthV6Alert";

describe("AuthV6 alerts", () => {
  it("keeps errors assertive and confirmations announced as status", () => {
    render(
      <>
        <AuthV6ErrorAlert>Invalid credentials</AuthV6ErrorAlert>
        <AuthV6SuccessAlert>Reset link sent</AuthV6SuccessAlert>
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
