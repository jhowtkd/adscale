"use client";

import { useEffect } from "react";
import * as React from "react";

export default function A11yProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined"
    ) {
      // Dynamically import axe-core only in development
      Promise.all([
        import("@axe-core/react"),
        import("react-dom"),
      ]).then(([axe, ReactDOM]) => {
        axe.default(React, ReactDOM, 1000, {
          rules: [
            {
              id: "color-contrast",
              enabled: true,
            },
            {
              id: "focusable-elements",
              enabled: true,
            },
            {
              id: "heading-order",
              enabled: true,
            },
            {
              id: "label",
              enabled: true,
            },
            {
              id: "landmark-one-main",
              enabled: true,
            },
            {
              id: "region",
              enabled: true,
            },
          ],
        });
      }).catch(() => {
        // Silently fail if axe-core is not available
      });
    }
  }, []);

  return <>{children}</>;
}
