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
}

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

export async function syncLichessData(
  lichessUsername: string,
  token?: string,
  force = false,
  onProgress?: () => void,
): Promise<{ newGames: number; newPuzzles: number }> {
  const username = lichessUsername.toLowerCase();
  const syncState = (await getLichessSyncState(username)) ?? { username };

  let newGamesCount = 0;
  let newPuzzlesCount = 0;

  // 1. Fetch & Store Lichess Games
  try {
    const since = force ? undefined : syncState.lastGamesSync;
    const rawGames = await getLichessGames(username, since);
    if (rawGames.length > 0) {
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
        newGamesCount = normalizedGames.length;
      }

      // Update newest game timestamp
      const maxTime = Math.max(...rawGames.map((g) => g.lastMoveAt || g.createdAt));
      syncState.lastGamesSync = Math.max(syncState.lastGamesSync ?? 0, maxTime);
    }
  } catch (err) {
    console.warn("Failed to sync Lichess games:", err);
  }

  // 2. Fetch & Store Lichess Puzzle Activity (if token provided)
  if (token && token.trim().length > 0) {
    try {
      const rounds = await getLichessPuzzleActivity(token, 300);
      if (rounds.length > 0) {
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
        newPuzzlesCount = attempts.length;

        syncState.lastPuzzlesSync = Date.now();
      }
    } catch (err) {
      console.warn("Failed to sync Lichess puzzle activity:", err);
    }
  }

  await saveLichessSyncState(syncState);
  onProgress?.();

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
