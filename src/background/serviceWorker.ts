import {
  getPlayerProfile,
  cleanUsername,
  ApiFailure,
} from "../data/api/chessComApi";
import { getSettings, setSettings } from "../data/storage/settingsRepository";
import { snapshot, syncYears } from "../data/sync/syncManager";
import { getUser, saveUser } from "../data/storage/gameRepository";
import type { Request, Reply } from "../shared/types";
import { validRequest } from "../shared/requestValidation";
import {
  puzzleSnapshot,
  startPuzzleTracking,
  savePuzzleAttempt,
  clearPuzzleHistory,
} from "../data/storage/puzzleRepository";
import { PUZZLE_CHANGE_KEY } from "../shared/constants";

function invalidRequestMessage(message: unknown) {
  const type =
    message && typeof message === "object" && "type" in message
      ? message.type
      : "";
  return type === "ci:theme-setting"
    ? "Invalid appearance theme."
    : type === "ci:sync"
      ? "Invalid sync period."
      : "Invalid extension request.";
}

async function notifyPuzzleChange(username: string) {
  await chrome.storage.local.set({
    [PUZZLE_CHANGE_KEY]: { username, token: crypto.randomUUID() },
  });
}

let puzzleMutations: Promise<unknown> = Promise.resolve();
function mutatePuzzles(
  action: () => Promise<Reply<unknown>>,
): Promise<Reply<unknown>> {
  const next = puzzleMutations.then(action, action);
  puzzleMutations = next.catch(() => undefined);
  return next;
}

export async function handleMessage(
  message: Request,
  onProgress?: () => void,
): Promise<Reply<unknown>> {
  try {
    if (!validRequest(message))
      throw new ApiFailure("INVALID_REQUEST", invalidRequestMessage(message));

    switch (message.type) {
      case "ci:puzzles":
        return {
          ok: true,
          data: await puzzleSnapshot(cleanUsername(message.username)),
        };

      case "ci:puzzle-start": {
        return await mutatePuzzles(async () => {
          if (!(await getSettings()).trackPuzzleActivity)
            return { ok: true, data: null };
          const username = cleanUsername(message.username);
          const previous = (await puzzleSnapshot(username)).tracking;
          const data = await startPuzzleTracking(username);
          if (!previous) await notifyPuzzleChange(username);
          return { ok: true, data };
        });
      }

      case "ci:puzzle-save": {
        return await mutatePuzzles(async () => {
          if (!(await getSettings()).trackPuzzleActivity)
            return { ok: true, data: false };
          const username = cleanUsername(message.attempt.username);
          const saved = await savePuzzleAttempt({
            ...message.attempt,
            username,
          });
          await notifyPuzzleChange(username);
          return { ok: true, data: saved };
        });
      }

      case "ci:puzzle-setting": {
        return await mutatePuzzles(async () => {
          await setSettings({ trackPuzzleActivity: message.enabled });
          return { ok: true, data: await getSettings() };
        });
      }

      case "ci:puzzle-clear": {
        return await mutatePuzzles(async () => {
          const username = cleanUsername(message.username);
          await clearPuzzleHistory(username);
          if ((await getSettings()).trackPuzzleActivity)
            await startPuzzleTracking(username);
          await notifyPuzzleChange(username);
          return { ok: true, data: true };
        });
      }

      case "ci:settings":
        return { ok: true, data: await getSettings() };

      case "ci:theme-setting":
        if (!["light", "dark"].includes(message.theme))
          throw new ApiFailure("INVALID_REQUEST", "Invalid appearance theme.");
        await setSettings({ theme: message.theme });
        return { ok: true, data: await getSettings() };

      case "ci:connect": {
        const profile = await getPlayerProfile(cleanUsername(message.username));
        const username = cleanUsername(profile.username as string);
        await setSettings({ username });
        const user = (await getUser(username)) ?? {
          username,
          archives: [],
          indexFetchedAt: 0,
          lastSync: 0,
          version: 0,
        };
        await saveUser({ ...user, profile });
        return { ok: true, data: { username } };
      }

      case "ci:snapshot":
        return {
          ok: true,
          data: await snapshot(cleanUsername(message.username)),
        };

      case "ci:sync": {
        if (
          !Array.isArray(message.years) ||
          message.years.length > 30 ||
          !message.years.every(
            (y) =>
              Number.isInteger(y) &&
              y >= 2000 &&
              y <= new Date().getFullYear() + 1,
          )
        )
          throw new ApiFailure("INVALID_REQUEST", "Invalid sync period.");
        await syncYears(
          message.username,
          message.years,
          message.force,
          onProgress,
        );
        return {
          ok: true,
          data: await snapshot(cleanUsername(message.username)),
        };
      }

      default:
        throw new ApiFailure("INVALID_REQUEST", "Unsupported request.");
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error instanceof ApiFailure ? error.code : "STORAGE",
        message:
          error instanceof Error ? error.message : "Unable to load local data.",
      },
    };
  }
}

chrome.runtime.onMessage.addListener((message: Request, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    !message ||
    typeof message.type !== "string" ||
    !message.type.startsWith("ci:")
  )
    return false;

  if (!validRequest(message)) {
    reply({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: invalidRequestMessage(message),
      },
    });
    return false;
  }

  const notify = () => {
    if (sender.tab?.id !== undefined && "username" in message)
      void chrome.tabs
        .sendMessage(sender.tab.id, {
          type: "ci:data-changed",
          username: message.username,
        })
        .catch(() => undefined);
  };

  void handleMessage(message, notify).then(reply);
  return true;
});
