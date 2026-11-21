import { database, idbResult, transactionDone } from "./database";
import { localDate } from "../../shared/dates";
import { getSettings } from "./settingsRepository";
import { getEdition } from "../../shared/edition";
import type {
  PuzzleAttempt,
  PuzzleSnapshot,
  PuzzleTrackingState,
} from "../../shared/types";

export function deduplicatePuzzleAttempts(
  attempts: PuzzleAttempt[],
): PuzzleAttempt[] {
  const byId = new Map<string, PuzzleAttempt>();
  for (const raw of attempts) {
    const a: PuzzleAttempt = { ...raw, platform: raw.platform ?? "chesscom" };
    byId.set(a.id, a);
  }
  const unique = [...byId.values()];

  const apiByPuzzle = new Map<string, PuzzleAttempt[]>();
  for (const a of unique) {
    if (a.platform === "lichess" && a.source === "lichess_api" && a.puzzleId) {
      const key = `${a.username.toLowerCase()}:${a.puzzleId}`;
      const bucket = apiByPuzzle.get(key) ?? [];
      bucket.push(a);
      apiByPuzzle.set(key, bucket);
    }
  }

  const result: PuzzleAttempt[] = [];
  for (const a of unique) {
    if (a.platform === "lichess" && a.source === "live_tracker" && a.puzzleId) {
      const key = `${a.username.toLowerCase()}:${a.puzzleId}`;
      const candidates = apiByPuzzle.get(key);
      const match = candidates?.find(
        (api) =>
          api.localDate === a.localDate ||
          Math.abs(api.attemptedAt - a.attemptedAt) <= 12 * 3600_000,
      );
      if (match) {
        match.ratingBefore ??= a.ratingBefore;
        match.ratingAfter ??= a.ratingAfter;
        match.ratingChange ??= a.ratingChange;
        match.puzzleRating ??= a.puzzleRating;
        continue;
      }
    }
    result.push(a);
  }

  return result.sort((a, b) => a.attemptedAt - b.attemptedAt);
}

export async function puzzleSnapshot(
  username: string,
): Promise<PuzzleSnapshot> {
  const edition = getEdition();
  const settings = await getSettings();
  const chessUser =
    edition === "lichess" ? undefined : settings.username?.toLowerCase();
  const lichessUser =
    edition === "chesscom"
      ? undefined
      : settings.lichessUsername?.toLowerCase();
  const accounts = [
    ...new Set(
      [username, chessUser, lichessUser]
        .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        .map((u) => u.trim().toLowerCase()),
    ),
  ];

  const tx = (await database()).transaction(
    ["puzzleAttempts", "puzzleTrackingState"],
    "readonly",
  );
  const attemptsStore = tx.objectStore("puzzleAttempts").index("username");
  const trackingStore = tx.objectStore("puzzleTrackingState");

  const [attemptLists, trackingStates] = await Promise.all([
    Promise.all(
      accounts.map(
        (acc) => idbResult(attemptsStore.getAll(acc)) as Promise<PuzzleAttempt[]>,
      ),
    ),
    Promise.all(
      accounts.map(
        (acc) =>
          idbResult(trackingStore.get(acc)) as Promise<
            PuzzleTrackingState | undefined
          >,
      ),
    ),
  ]);

  const allAttempts = attemptLists.flat().filter((a) => {
    const aPlatform = a.platform ?? "chesscom";
    return edition === "all" || aPlatform === edition;
  });
  const validTrackings = trackingStates.filter(
    (t): t is PuzzleTrackingState => !!t,
  );
  const primaryTracking =
    validTrackings.find(
      (t) => t.username.toLowerCase() === username.toLowerCase(),
    ) ??
    validTrackings.sort(
      (a, b) => a.puzzleTrackingStartedAt - b.puzzleTrackingStartedAt,
    )[0] ??
    null;

  return {
    attempts: deduplicatePuzzleAttempts(allAttempts),
    tracking: primaryTracking,
  };
}

export async function startPuzzleTracking(username: string, now = Date.now()) {
  const tx = (await database()).transaction("puzzleTrackingState", "readwrite"),
    done = transactionDone(tx);
  const store = tx.objectStore("puzzleTrackingState");
  const previous = (await idbResult(store.get(username))) as
    PuzzleTrackingState | undefined;
  const state = previous ?? {
    username,
    puzzleTrackingStartedAt: now,
    puzzleTrackingStartedLocalDate: localDate(new Date(now)),
    revision: 0,
  };
  if (!previous) store.add(state);
  await done;
  return state;
}

export async function savePuzzleAttempt(attempt: PuzzleAttempt) {
  if (
    !attempt.username ||
    !attempt.id ||
    !Number.isFinite(attempt.attemptedAt) ||
    attempt.attemptedAt <= 0 ||
    attempt.attemptedAt > Date.now() + 60000 ||
    !["solved", "failed", "unknown"].includes(attempt.result)
  )
    throw new Error("Invalid puzzle attempt");
  const tx = (await database()).transaction(
    ["puzzleAttempts", "puzzleTrackingState"],
    "readwrite",
  ),
    done = transactionDone(tx);
  const store = tx.objectStore("puzzleAttempts"),
    states = tx.objectStore("puzzleTrackingState");
  const [previous, state] = await Promise.all([
    idbResult(store.get(attempt.id)),
    idbResult(states.get(attempt.username)) as Promise<
      PuzzleTrackingState | undefined
    >,
  ]);
  if (!state) {
    tx.abort();
    await done.catch(() => undefined);
    throw new Error("Puzzle tracking has not started");
  }
  if (attempt.attemptedAt < state.puzzleTrackingStartedAt) {
    await done;
    return false;
  }
  if (!previous) {
    store.add({
      ...attempt,
      localDate: localDate(new Date(attempt.attemptedAt)),
      source: "live_tracker",
      createdAt: Date.now(),
    });
    states.put({ ...state, revision: state.revision + 1 });
  }
  await done;
  return !previous;
}

export async function clearPuzzleHistory(username: string) {
  const tx = (await database()).transaction(
    ["puzzleAttempts", "puzzleTrackingState"],
    "readwrite",
  ),
    done = transactionDone(tx);
  const store = tx.objectStore("puzzleAttempts");
  const keys = await idbResult(store.index("username").getAllKeys(username));
  keys.forEach((key) => store.delete(key));
  tx.objectStore("puzzleTrackingState").delete(username);
  await done;
}
