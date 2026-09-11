import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "StudioStage.module.css"), "utf8");

function rule(selector: string): string {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} missing`).toBeTruthy();
  return match![1];
}

it("clips desk posters without clipping TalkBox pills or the request card", () => {
  expect(rule(".workspace[data-empty=\"false\"]")).not.toMatch(/overflow\s*:/);
  expect(rule(".workspace[data-empty=\"false\"] .desk")).toMatch(/overflow:\s*clip/);
  expect(rule(".workspace[data-empty=\"false\"] .dock")).toMatch(/justify-content:\s*flex-start/);
  expect(rule(".workspace[data-empty=\"false\"] .dock")).toMatch(/overflow-y:\s*auto/);
  expect(rule(".workspace[data-empty=\"false\"] .dock > *")).toMatch(/margin-top:\s*auto/);
  expect(rule(".workspace[data-empty=\"false\"] .dock > *")).toMatch(/min-height:\s*min-content/);
  expect(rule(".workspace[data-empty=\"false\"] .dock > *")).toMatch(/max-height:\s*none/);
  expect(rule(".talkBox")).toMatch(/overflow:\s*visible/);
  expect(rule(".talkBox")).not.toMatch(/overflow:\s*hidden/);
  expect(rule(".body")).toMatch(/overflow:\s*visible/);
  expect(rule(".body")).toMatch(/min-height:\s*min-content/);
  expect(rule(".controls[data-expanded=\"true\"]")).toMatch(/grid-template-rows:\s*auto/);
  expect(rule(".controls[data-expanded=\"true\"]")).not.toMatch(/1fr/);
  expect(rule(".controls[data-expanded=\"true\"] .controlsInner")).toMatch(/overflow:\s*visible/);
});
