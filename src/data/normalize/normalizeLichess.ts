import type {
  NormalizedGame,
  PuzzleAttempt,
  TimeClass,
  Result,
  Color,
} from "../../shared/types";
import { fromUnixLocal, localDate } from "../../shared/dates";
import type { LichessRawGame, LichessPuzzleRound } from "../api/lichessApi";

function mapLichessSpeed(speed?: string, perf?: string): TimeClass {
  switch (speed) {
    case "ultraBullet":
    case "bullet":
      return "bullet";
    case "blitz":
      return "blitz";
    case "rapid":
    case "classical":
      return "rapid";
    case "correspondence":
      return "daily";
    default:
      if (perf === "correspondence") return "daily";
      return "unknown";
  }
}

function mapLichessStatus(status?: string, winner?: "white" | "black", playerColor?: Color): string {
  switch (status) {
    case "mate":
      return "Checkmate";
    case "resign":
      return winner === playerColor ? "Opponent resigned" : "Resignation";
    case "outoftime":
      return "Timeout";
    case "draw":
    case "stalemate":
      return "Draw";
    case "timeout":
      return "Timeout";
    case "cheat":
      return "Cheat detection";
    case "noStart":
      return "Abandoned";
    default:
      return status ?? "";
  }
}

function parseOpening(fullName?: string): { name: string | null; variation: string | null } {
  if (!fullName) return { name: null, variation: null };
  const colonIndex = fullName.indexOf(":");
  if (colonIndex !== -1) {
    return {
      name: fullName.slice(0, colonIndex).trim(),
      variation: fullName.slice(colonIndex + 1).trim() || null,
    };
  }
  return { name: fullName, variation: null };
}

export function normalizeLichessGame(
  raw: LichessRawGame,
  accountUsername: string,
): NormalizedGame | null {
  if (raw.variant && raw.variant !== "standard") return null;

  const username = accountUsername.toLowerCase();
  const whiteUser = (raw.players.white.user?.id ?? raw.players.white.user?.name)?.toLowerCase();
  const blackUser = (raw.players.black.user?.id ?? raw.players.black.user?.name)?.toLowerCase();

  const playerColor: Color | null =
    whiteUser === username ? "white" : blackUser === username ? "black" : null;

  if (!playerColor) return null;

  const player = playerColor === "white" ? raw.players.white : raw.players.black;
  const opponent = playerColor === "white" ? raw.players.black : raw.players.white;

  let result: Result = "draw";
  if (raw.winner === playerColor) {
    result = "win";
  } else if (raw.winner) {
    result = "loss";
  } else if (raw.status === "draw" || raw.status === "stalemate") {
    result = "draw";
  } else {
    result = "draw";
  }

  const endTimestampSeconds = Math.floor((raw.lastMoveAt || raw.createdAt) / 1000);
  if (!Number.isFinite(endTimestampSeconds) || endTimestampSeconds <= 0) return null;

  const clock = raw.clock;
  const timeControl = clock
    ? `${clock.initial}+${clock.increment}`
    : raw.daysPerTurn
      ? `1/${raw.daysPerTurn * 86400}`
      : "";

  const whiteRating = raw.players.white.rating ?? null;
  const blackRating = raw.players.black.rating ?? null;
  const parsedOpening = parseOpening(raw.opening?.name);

  return {
    id: `lichess:${raw.id}`,
    platform: "lichess",
    url: `https://lichess.org/${raw.id}`,
    username,
    endTime: endTimestampSeconds,
    localDate: fromUnixLocal(endTimestampSeconds),
    timeClass: mapLichessSpeed(raw.speed, raw.perf),
    timeControl,
    rated: raw.rated === true,
    rules: !raw.variant || raw.variant === "standard" ? "chess" : raw.variant,
    playerColor,
    result,
    rawPlayerResult: raw.winner === playerColor ? "win" : raw.winner ? "loss" : "draw",
    rawOpponentResult: raw.winner === playerColor ? "loss" : raw.winner ? "win" : "draw",
    termination: mapLichessStatus(raw.status, raw.winner, playerColor),
    playerRating: player.rating ?? null,
    opponentRating: opponent.rating ?? null,
    opponentUsername: (playerColor === "white" ? raw.players.black.user?.name : raw.players.white.user?.name) ?? "Anonymous",
    whiteUsername: raw.players.white.user?.name ?? null,
    blackUsername: raw.players.black.user?.name ?? null,
    whiteRating,
    blackRating,
    eco: raw.opening?.eco ?? null,
    openingName: parsedOpening.name,
    variation: parsedOpening.variation,
    pgn: null,
  };
}

export function normalizeLichessPuzzle(
  round: LichessPuzzleRound,
  username: string,
): PuzzleAttempt {
  const attemptedAt = round.date;
  const result = round.win ? "solved" : "failed";

  return {
    id: `lichess:puzzle:${round.puzzle.id}:${round.date}`,
    platform: "lichess",
    username: username.toLowerCase(),
    puzzleId: round.puzzle.id,
    attemptedAt,
    localDate: localDate(new Date(attemptedAt)),
    result,
    ratingBefore: null,
    ratingAfter: null,
    ratingChange: null,
    puzzleRating: round.puzzle.rating ?? null,
    source: "lichess_api",
    createdAt: Date.now(),
  };
}
