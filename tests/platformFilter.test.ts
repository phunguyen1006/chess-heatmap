import { describe, it, expect } from "vitest";
import { combinedActivity } from "../src/analytics/puzzles";
import type { NormalizedGame, PuzzleAttempt } from "../src/shared/types";

describe("Platform filtering and unified streak calculations", () => {
  const games: NormalizedGame[] = [
    {
      id: "g1",
      url: "https://chess.com/game/1",
      username: "user",
      endTime: 1710000000,
      localDate: "2024-03-09",
      timeClass: "blitz",
      timeControl: "180",
      rated: true,
      rules: "chess",
      playerColor: "white",
      result: "win",
      rawPlayerResult: "win",
      rawOpponentResult: "checkmated",
      termination: "Normal",
      playerRating: 1500,
      opponentRating: 1480,
      opponentUsername: "opp1",
      whiteUsername: "user",
      blackUsername: "opp1",
      whiteRating: 1500,
      blackRating: 1480,
      eco: null,
      openingName: null,
      variation: null,
      pgn: null,
      platform: "chesscom",
    },
    {
      id: "g2",
      url: "https://lichess.org/2",
      username: "user",
      endTime: 1710100000,
      localDate: "2024-03-10",
      timeClass: "rapid",
      timeControl: "600",
      rated: true,
      rules: "chess",
      playerColor: "black",
      result: "win",
      rawPlayerResult: "win",
      rawOpponentResult: "resign",
      termination: "Resignation",
      playerRating: 1700,
      opponentRating: 1690,
      opponentUsername: "opp2",
      whiteUsername: "opp2",
      blackUsername: "user",
      whiteRating: 1690,
      blackRating: 1700,
      eco: null,
      openingName: null,
      variation: null,
      pgn: null,
      platform: "lichess",
    },
  ];

  const attempts: PuzzleAttempt[] = [
    {
      id: "p1",
      username: "user",
      puzzleId: "p123",
      attemptedAt: 1710200000000,
      localDate: "2024-03-11",
      result: "solved",
      ratingBefore: null,
      ratingAfter: null,
      ratingChange: null,
      puzzleRating: 1600,
      source: "lichess_api",
      createdAt: 1710200000000,
      platform: "lichess",
    },
  ];

  it("calculates continuous multi-day streak across platforms in 'all' mode", () => {
    // March 9 (Chess.com game) -> March 10 (Lichess game) -> March 11 (Lichess puzzle)
    const stats = combinedActivity(games, attempts, "2024-03-11");
    expect(stats.activeDays).toBe(3);
    expect(stats.current).toBe(3);
    expect(stats.longest).toBe(3);
    expect(stats.games).toBe(2);
    expect(stats.puzzles).toBe(1);
  });

  it("calculates single-platform statistics when filtered to Chess.com", () => {
    const chessGames = games.filter((g) => (g.platform ?? "chesscom") === "chesscom");
    const chessAttempts = attempts.filter((a) => (a.platform ?? "chesscom") === "chesscom");

    const stats = combinedActivity(chessGames, chessAttempts, "2024-03-11");
    expect(stats.activeDays).toBe(1);
    expect(stats.longest).toBe(1);
    expect(stats.games).toBe(1);
    expect(stats.puzzles).toBe(0);
  });

  it("calculates single-platform statistics when filtered to Lichess", () => {
    const lichessGames = games.filter((g) => g.platform === "lichess");
    const lichessAttempts = attempts.filter((a) => a.platform === "lichess");

    const stats = combinedActivity(lichessGames, lichessAttempts, "2024-03-11");
    expect(stats.activeDays).toBe(2);
    expect(stats.current).toBe(2);
    expect(stats.longest).toBe(2);
    expect(stats.games).toBe(1);
    expect(stats.puzzles).toBe(1);
  });
});
