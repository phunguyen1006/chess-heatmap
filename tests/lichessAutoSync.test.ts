import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: { lichessUsername: "alice", lichessToken: "token" } as { lichessUsername?: string; lichessToken?: string },
  state: undefined as { lastSuccessfulSync?: number } | undefined,
  sync: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("../src/data/storage/settingsRepository", () => ({
  getSettings: async () => ({ ...mocks.settings }),
  setSettings: async (value: object) => Object.assign(mocks.settings, value),
}));
vi.mock("../src/data/sync/lichessSync", () => ({
  getLichessSyncState: async () => mocks.state,
  syncLichessData: mocks.sync,
  clearLichessData: mocks.clear,
}));

let alarm: (alarm: { name: string }) => void;
beforeEach(async () => {
  vi.resetModules();
  mocks.settings = { lichessUsername: "alice", lichessToken: "token" };
  mocks.state = undefined;
  mocks.sync.mockReset().mockResolvedValue({});
  mocks.clear.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    runtime: { id: "test", onMessage: { addListener: vi.fn() } },
    storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
    alarms: {
      get: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      onAlarm: { addListener: (fn: typeof alarm) => { alarm = fn; } },
    },
  });
  await import("../src/background/serviceWorker");
});
afterEach(() => vi.unstubAllGlobals());

it("schedules a periodic sync and runs it for the connected account", async () => {
  expect(chrome.alarms.create).toHaveBeenCalledWith("lichess-auto-sync", { periodInMinutes: 30 });
  alarm({ name: "lichess-auto-sync" });
  await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledWith("alice", "token", false, undefined));
});

it("skips a recent automatic sync but allows a manual refresh", async () => {
  mocks.state = { lastSuccessfulSync: Date.now() };
  const { handleMessage } = await import("../src/background/serviceWorker");
  await handleMessage({ type: "ci:lichess-sync" });
  expect(mocks.sync).not.toHaveBeenCalled();
  await handleMessage({ type: "ci:lichess-sync", force: true });
  expect(mocks.sync).toHaveBeenCalledTimes(1);
});

it("serializes a disconnect after an in-flight sync", async () => {
  let finish!: () => void;
  mocks.sync.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const { handleMessage } = await import("../src/background/serviceWorker");
  const syncing = handleMessage({ type: "ci:lichess-sync" });
  await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalled());
  const disconnecting = handleMessage({ type: "ci:lichess-disconnect" });
  expect(mocks.clear).not.toHaveBeenCalled();
  finish();
  await Promise.all([syncing, disconnecting]);
  expect(mocks.clear).toHaveBeenCalledWith("alice");
  await handleMessage({ type: "ci:lichess-sync" });
  expect(mocks.sync).toHaveBeenCalledTimes(1);
});
