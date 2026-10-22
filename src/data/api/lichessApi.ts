import { ApiFailure } from "./chessComApi";

export interface LichessUser {
  id: string;
  username: string;
  createdAt?: number;
  count?: {
    all?: number;
    rated?: number;
    ai?: number;
    draw?: number;
    drawH?: number;
    loss?: number;
    lossH?: number;
    win?: number;
    winH?: number;
  };
}

export interface LichessRawGame {
  id: string;
  rated?: boolean;
  variant?: string;
  speed?: string;
  perf?: string;
  createdAt: number;
  lastMoveAt?: number;
  status?: string;
  players: {
    white: {
      user?: { name?: string; id?: string };
      rating?: number;
      ratingDiff?: number;
    };
    black: {
      user?: { name?: string; id?: string };
      rating?: number;
      ratingDiff?: number;
    };
  };
  winner?: "white" | "black";
  opening?: {
    eco?: string;
    name?: string;
    ply?: number;
  };
  clock?: {
    initial: number;
    increment: number;
    totalTime?: number;
  };
  daysPerTurn?: number;
}

export interface LichessPuzzleRound {
  id?: string;
  date: number; // Unix timestamp in milliseconds
  win: boolean;
  puzzle: {
    id: string;
    rating?: number;
    plays?: number;
    initialPly?: number;
    fen?: string;
    themes?: string[];
  };
}

let queue: Promise<unknown> = Promise.resolve();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestLichess<T>(
  url: string,
  token?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const reqHeaders: Record<string, string> = {
    ...headers,
  };
  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token.trim()}`;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: reqHeaders,
        credentials: "omit",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ApiFailure(
        "NETWORK",
        "Unable to reach Lichess. Showing cached data if available.",
      );
    }

    if (response.status === 429 && attempt < 3) {
      await pause(Math.min(25_000, 1500 * 2 ** attempt));
      continue;
    }

    if (response.status === 401) {
      throw new ApiFailure(
        "LICHESS_UNAUTHORIZED",
        "Invalid Lichess API Token. Ensure it has puzzle:read permission.",
      );
    }

    if (response.status === 404) {
      throw new ApiFailure("404", "Lichess user or resource not found.");
    }

    if (!response.ok) {
      throw new ApiFailure(
        String(response.status),
        `Lichess API returned status ${response.status}`,
      );
    }

    return response;
  }

  throw new ApiFailure("429", "Lichess is rate limiting requests.");
}

export async function parseNdjson<T>(response: Response): Promise<T[]> {
  const text = await response.text();
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const items: T[] = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line) as T);
    } catch {
      // ignore malformed line
    }
  }
  return items;
}

export async function getLichessProfile(
  username: string,
  token?: string,
): Promise<LichessUser> {
  const run = async () => {
    const url = `https://lichess.org/api/user/${encodeURIComponent(username.toLowerCase())}`;
    const response = await requestLichess(url, token, {
      Accept: "application/json",
    });
    return (await response.json()) as LichessUser;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

export async function getLichessGames(
  username: string,
  since?: number,
  until?: number,
  max = 300,
): Promise<LichessRawGame[]> {
  const run = async () => {
    const params = new URLSearchParams({
      moves: "false",
      opening: "true",
      max: String(max),
    });
    if (since) params.set("since", String(since));
    if (until) params.set("until", String(until));

    const url = `https://lichess.org/api/games/user/${encodeURIComponent(username.toLowerCase())}?${params.toString()}`;
    const response = await requestLichess(url, undefined, {
      Accept: "application/x-ndjson",
    });
    return parseNdjson<LichessRawGame>(response);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

export async function getLichessPuzzleActivity(
  token: string,
  max = 500,
  before?: number,
): Promise<LichessPuzzleRound[]> {
  const run = async () => {
    const params = new URLSearchParams({
      max: String(max),
    });
    if (before) params.set("before", String(before));

    const url = `https://lichess.org/api/puzzle/activity?${params.toString()}`;
    const response = await requestLichess(url, token, {
      Accept: "application/x-ndjson",
    });
    return parseNdjson<LichessPuzzleRound>(response);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
