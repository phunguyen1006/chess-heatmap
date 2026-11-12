// @vitest-environment jsdom
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Setup } from "../src/features/components/Setup";
import type { DataState } from "../src/features/state/useData";

it("uses a browser-valid username pattern that accepts hyphens and rejects invalid names", () => {
  const state: DataState = {
    data: { games: [], years: [2026], lastSync: 0, version: 0 },
    username: "",
    settingsLoaded: true,
    loading: false,
    error: "",
    refresh: async () => {},
    connect: async () => true,
  };
  document.body.innerHTML = renderToStaticMarkup(<Setup state={state} detected={null} />);
  const input = document.querySelector<HTMLInputElement>('input[pattern]')!;
  // Chrome compiles HTML patterns with the Unicode-sets (v) flag.
  const pattern = new RegExp(`^(?:${input.pattern})$`, "v");
  expect(pattern.test("valid-user_123")).toBe(true);
  expect(pattern.test("a")).toBe(false);
  expect(pattern.test("invalid name")).toBe(false);
  expect(pattern.test("bad!name")).toBe(false);
});
