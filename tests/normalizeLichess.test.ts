import { describe, it, expect } from "vitest";
import {
  normalizeLichessGame,
  normalizeLichessPuzzle,
} from "../src/data/normalize/normalizeLichess";
import type { LichessRawGame, LichessPuzzleRound } from "../src/data/api/lichessApi";

describe("normalizeLichessGame", () => {
  it("normalizes a standard Lichess game played as white with victory", () => {
    const raw: LichessRawGame = {
      id: "abc12345",
      rated: true,
      variant: "standard",
      speed: "blitz",
      createdAt: 1710000000000,
      lastMoveAt: 1710000300000,
      status: "mate",
      winner: "white",
      players: {
        white: {
          user: { id: "testuser", name: "TestUser" },
          rating: 1800,
          ratingDiff: 10,
        },
        black: {
          user: { id: "opponent1", name: "Opponent1" },
          rating: 1750,
          ratingDiff: -10,
        },
      },
      opening: {
        eco: "B90",
        name: "Sicilian Defense: Najdorf Variation",
      },
    };

    const norm = normalizeLichessGame(raw, "testuser");
    expect(norm).not.toBeNull();
    expect(norm?.platform).toBe("lichess");
    expect(norm?.playerColor).toBe("white");
    expect(norm?.result).toBe("win");
    expect(norm?.timeClass).toBe("blitz");
    expect(norm?.playerRating).toBe(1800);
    expect(norm?.opponentRating).toBe(1750);
    expect(norm?.opponentUsername).toBe("Opponent1");
    expect(norm?.openingName).toBe("Sicilian Defense");
    expect(norm?.variation).toBe("Najdorf Variation");
    expect(norm?.url).toBe("https://lichess.org/abc12345");
  });

  it("normalizes a game played as black resulting in loss", () => {
    const raw: LichessRawGame = {
      id: "xyz98765",
      rated: false,
      variant: "standard",
      speed: "rapid",
      createdAt: 1710000000000,
      lastMoveAt: 1710000600000,
      status: "resign",
      winner: "white",
      players: {
        white: {
          user: { id: "master1", name: "Master1" },
          rating: 2100,
        },
        black: {
          user: { id: "testuser", name: "TestUser" },
          rating: 1950,
        },
      },
    };

    const norm = normalizeLichessGame(raw, "testuser");
    expect(norm).not.toBeNull();
    expect(norm?.platform).toBe("lichess");
    expect(norm?.playerColor).toBe("black");
    expect(norm?.result).toBe("loss");
    expect(norm?.timeClass).toBe("rapid");
    expect(norm?.termination).toBe("Resignation");
  });

  it("maps speed correctly for correspondence and classical", () => {
    const rawCorrespondence: LichessRawGame = {
      id: "corr123",
      variant: "standard",
      speed: "correspondence",
      createdAt: 1710000000000,
      players: {
        white: { user: { id: "testuser" } },
        black: { user: { id: "other" } },
      },
    };
    expect(normalizeLichessGame(rawCorrespondence, "testuser")?.timeClass).toBe("daily");

    const rawClassical: LichessRawGame = {
      id: "class123",
      variant: "standard",
      speed: "classical",
      createdAt: 1710000000000,
      players: {
        white: { user: { id: "testuser" } },
        black: { user: { id: "other" } },
      },
    };
    expect(normalizeLichessGame(rawClassical, "testuser")?.timeClass).toBe("rapid");
  });

  it("filters out non-standard chess variants", () => {
    const rawCrazyhouse: LichessRawGame = {
      id: "crazy123",
      variant: "crazyhouse",
      speed: "blitz",
      createdAt: 1710000000000,
      players: {
        white: { user: { id: "testuser" } },
        black: { user: { id: "other" } },
      },
    };
    expect(normalizeLichessGame(rawCrazyhouse, "testuser")).toBeNull();
  });
});

describe("normalizeLichessPuzzle", () => {
  it("normalizes a solved Lichess puzzle round", () => {
    const round: LichessPuzzleRound = {
      date: 1710000000000,
      win: true,
      puzzle: {
        id: "000a9",
        rating: 1650,
        plays: 420,
        themes: ["fork", "endgame"],
      },
    };

    const attempt = normalizeLichessPuzzle(round, "testuser");
    expect(attempt.platform).toBe("lichess");
    expect(attempt.username).toBe("testuser");
    expect(attempt.puzzleId).toBe("000a9");
    expect(attempt.result).toBe("solved");
    expect(attempt.puzzleRating).toBe(1650);
    expect(attempt.source).toBe("lichess_api");
    expect(attempt.attemptedAt).toBe(1710000000000);
  });

  it("normalizes a failed Lichess puzzle round", () => {
    const round: LichessPuzzleRound = {
      date: 1710000000000,
      win: false,
      puzzle: {
        id: "fail123",
        rating: 2100,
      },
    };

    const attempt = normalizeLichessPuzzle(round, "testuser");
    expect(attempt.result).toBe("failed");
    expect(attempt.puzzleId).toBe("fail123");
  });
});
