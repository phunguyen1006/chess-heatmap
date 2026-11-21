import {
  getLichessProfile,
  getLichessGames,
  getLichessPuzzleActivity,
} from "../api/lichessApi";
import {
  normalizeLichessGame,
  normalizeLichessPuzzle,
} from "../normalize/normalizeLichess";
import { database, idbResult, transactionDone } from "../storage/database";
import type { NormalizedGame, PuzzleAttempt } from "../../shared/types";

export interface LichessSyncState {
  username: string;
  lastGamesSync?: number;
  lastPuzzlesSync?: number;
  lastSuccessfulSync?: number;
  syncedYears?: number[];
}

const PAGE_SIZE = 300;
const MAX_PAGES_PER_SYNC = 4;

export async function getLichessSyncState(
  username: string,
): Promise<LichessSyncState | undefined> {
  const db = await database();
  return idbResult(
    db.transaction("lichessSync").objectStore("lichessSync").get(username.toLowerCase()),
  );
}

export async function saveLichessSyncState(state: LichessSyncState) {
  const db = await database();
  const tx = db.transaction("lichessSync", "readwrite");
  tx.objectStore("lichessSync").put(state);
  await transactionDone(tx);
}

async function storeRawLichessGames(
  rawGames: Awaited<ReturnType<typeof getLichessGames>>,
  username: string,
): Promise<number> {
  if (rawGames.length === 0) return 0;
  const normalizedGames: NormalizedGame[] = [];
  for (const raw of rawGames) {
    const norm = normalizeLichessGame(raw, username);
    if (norm) normalizedGames.push(norm);
  }
  if (normalizedGames.length > 0) {
    const db = await database();
    const tx = db.transaction("games", "readwrite");
    const store = tx.objectStore("games");
    for (const game of normalizedGames) {
      store.put(game);
    }
    await transactionDone(tx);
  }
  return normalizedGames.length;
}

async function fetchPaginatedGamesWindow(
  username: string,
  since: number | undefined,
  initialUntil: number | undefined,
  token: string | undefined,
  maxPages = MAX_PAGES_PER_SYNC,
) {
  let until = initialUntil;
  let totalStored = 0;
  let newestTimestamp = 0;

  for (let page = 0; page < maxPages; page++) {
    const rawGames = await getLichessGames(
      username,
      since,
      until,
      PAGE_SIZE,
      token,
    );
    if (rawGames.length === 0) break;

    totalStored += await storeRawLichessGames(rawGames, username);

    const times = rawGames
      .map((g) => g.lastMoveAt || g.createdAt)
      .filter((t) => Number.isFinite(t) && t > 0);
    if (times.length > 0) {
      newestTimestamp = Math.max(newestTimestamp, ...times);
    }

    if (rawGames.length < PAGE_SIZE) break;
    const createdTimes = rawGames
      .map((g) => g.createdAt)
      .filter((t) => Number.isFinite(t) && t > 0);
    if (createdTimes.length === 0) break;
    const oldestCreated = Math.min(...createdTimes);
    if (until !== undefined && oldestCreated >= until) break;
    if (since !== undefined && oldestCreated <= since) break;
    until = oldestCreated - 1;
  }

  return { totalStored, newestTimestamp };
}

export async function syncLichessData(
  lichessUsername: string,
  token?: string,
  force = false,
  onProgress?: () => void,
  years?: number[],
): Promise<{ newGames: number; newPuzzles: number }> {
  const username = lichessUsername.toLowerCase();
  const syncState = (await getLichessSyncState(username)) ?? { username };
  const cleanToken = token?.trim() || undefined;

  let newGamesCount = 0;
  let newPuzzlesCount = 0;
  let failure: unknown;

  // 1. Fetch & Store Lichess Games (incremental + requested historical years)
  try {
    const currentYear = new Date().getFullYear();
    const since = force ? undefined : syncState.lastGamesSync;

    const { totalStored, newestTimestamp } = await fetchPaginatedGamesWindow(
      username,
      since,
      undefined,
      cleanToken,
    );
    newGamesCount += totalStored;
    if (newestTimestamp > 0) {
      syncState.lastGamesSync = Math.max(
        syncState.lastGamesSync ?? 0,
        newestTimestamp,
      );
    }

    const syncedYears = new Set(syncState.syncedYears ?? [currentYear]);
    syncedYears.add(currentYear);

    if (years && years.length > 0) {
      for (const year of years) {
        if (!force && syncedYears.has(year)) continue;
        if (year < currentYear) {
          const yearStart = Date.UTC(year, 0, 1);
          const yearEnd = Date.UTC(year + 1, 0, 1) - 1;
          const res = await fetchPaginatedGamesWindow(
            username,
            yearStart,
            yearEnd,
            cleanToken,
          );
          newGamesCount += res.totalStored;
        }
        syncedYears.add(year);
      }
    }
    syncState.syncedYears = [...syncedYears].sort((a, b) => b - a);
  } catch (err) {
    failure = err;
    console.warn("Failed to sync Lichess games:", err);
  }

  // 2. Fetch & Store Lichess Puzzle Activity (if token provided)
  if (cleanToken) {
    try {
      const previousPuzzleSync = force ? undefined : syncState.lastPuzzlesSync;
      let before: number | undefined;
      let newestPuzzleDate = syncState.lastPuzzlesSync ?? 0;

      for (let page = 0; page < MAX_PAGES_PER_SYNC; page++) {
        const rounds = await getLichessPuzzleActivity(
          cleanToken,
          PAGE_SIZE,
          before,
        );
        if (rounds.length === 0) break;

        const attempts: PuzzleAttempt[] = [];
        for (const round of rounds) {
          attempts.push(normalizeLichessPuzzle(round, username));
        }

        const db = await database();
        const tx = db.transaction("puzzleAttempts", "readwrite");
        const store = tx.objectStore("puzzleAttempts");
        for (const attempt of attempts) {
          store.put(attempt);
        }
        await transactionDone(tx);
        newPuzzlesCount += attempts.length;

        const dates = rounds
          .map((r) => r.date)
          .filter((d) => Number.isFinite(d) && d > 0);
        if (dates.length > 0) {
          newestPuzzleDate = Math.max(newestPuzzleDate, ...dates);
        }

        if (rounds.length < PAGE_SIZE) break;
        if (dates.length === 0) break;
        const oldestDate = Math.min(...dates);
        if (before !== undefined && oldestDate >= before) break;
        if (previousPuzzleSync && oldestDate <= previousPuzzleSync) break;
        before = oldestDate - 1;
      }

      syncState.lastPuzzlesSync = Math.max(newestPuzzleDate, Date.now());
    } catch (err) {
      failure ??= err;
      console.warn("Failed to sync Lichess puzzle activity:", err);
    }
  }

  if (!failure) syncState.lastSuccessfulSync = Date.now();
  await saveLichessSyncState(syncState);
  onProgress?.();
  if (failure) throw failure;

  return { newGames: newGamesCount, newPuzzles: newPuzzlesCount };
}

export async function clearLichessData(username: string) {
  const db = await database();
  const lowerUser = username.toLowerCase();

  // Clear games
  const txGames = db.transaction("games", "readwrite");
  const gamesStore = txGames.objectStore("games");
  const games = (await idbResult(
    gamesStore.index("username").getAll(lowerUser),
  )) as NormalizedGame[];
  for (const g of games) {
    if (g.platform === "lichess") {
      gamesStore.delete(g.id);
    }
  }
  await transactionDone(txGames);

  // Clear puzzles
  const txPuzzles = db.transaction("puzzleAttempts", "readwrite");
  const puzzleStore = txPuzzles.objectStore("puzzleAttempts");
  const attempts = (await idbResult(
    puzzleStore.index("username").getAll(lowerUser),
  )) as PuzzleAttempt[];
  for (const a of attempts) {
    if (a.platform === "lichess") {
      puzzleStore.delete(a.id);
    }
  }
  await transactionDone(txPuzzles);

  // Clear sync state
  const txSync = db.transaction("lichessSync", "readwrite");
  txSync.objectStore("lichessSync").delete(lowerUser);
  await transactionDone(txSync);
}
