import { beforeEach, afterEach, expect, it, vi } from "vitest";

let listener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (r: unknown) => void,
) => unknown;

vi.mock("../src/data/storage/settingsRepository", () => ({
  getSettings: async () => ({}),
  setSettings: vi.fn(),
}));

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("chrome", {
    runtime: {
      id: "audit-extension",
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
    },
  });
  await import("../src/background/serviceWorker");
});

afterEach(() => vi.unstubAllGlobals());

it("rejects foreign senders and non-extension actions without replying", () => {
  const reply = vi.fn();
  expect(listener({ type: "ci:settings" }, { id: "foreign" }, reply)).toBe(
    false,
  );
  expect(
    listener({ type: "page:settings" }, { id: "audit-extension" }, reply),
  ).toBe(false);
  expect(reply).not.toHaveBeenCalled();
});

it("rejects a non-boolean settings mutation at the message boundary", async () => {
  const { handleMessage } = await import("../src/background/serviceWorker");
  expect(
    await handleMessage({
      type: "ci:puzzle-setting",
      enabled: "false",
    } as never),
  ).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  const { setSettings } =
    await import("../src/data/storage/settingsRepository");
  expect(setSettings).not.toHaveBeenCalled();
});

it("rejects unsupported requests at the message boundary", async () => {
  const { handleMessage } = await import("../src/background/serviceWorker");
  for (const message of [
    { type: "ci:analysis", username: "alice", action: "arbitrary" },
    { type: "ci:unknown-action" },
    { type: "ci:theme-setting", theme: "unsupported-theme" },
    { type: "ci:lichess-connect", username: "" },
    { type: "ci:lichess-connect", username: "valid", token: 12345 },
  ]) {
    expect(await handleMessage(message as never)).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  }
});
