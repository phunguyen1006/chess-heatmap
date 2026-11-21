// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Setup } from "../src/features/components/Setup";
import { HomepageHeatmap } from "../src/features/heatmap/HomepageHeatmap";
import { DayDetail } from "../src/features/heatmap/DayDetail";
import { Popup } from "../src/popup/Popup";
import type { DataState } from "../src/features/state/useData";
import { snapshot } from "../src/data/sync/syncManager";
import { puzzleSnapshot } from "../src/data/storage/puzzleRepository";
import { syncLichessData, getLichessSyncState } from "../src/data/sync/lichessSync";
import * as lichessApi from "../src/data/api/lichessApi";
import { database, transactionDone } from "../src/data/storage/database";
import type { NormalizedGame, PuzzleAttempt, Settings } from "../src/shared/types";
import type { Edition } from "../src/shared/edition";

const mockSettings: { current: Settings } = {
  current: {},
};

vi.mock("../src/data/storage/settingsRepository", () => ({
  getSettings: async () => ({ ...mockSettings.current }),
  setSettings: async (patch: Settings) => {
    Object.assign(mockSettings.current, patch);
  },
}));

describe("Decoupled Lichess-only & dual-platform data snapshots", () => {
  beforeEach(async () => {
    mockSettings.current = {};
    const db = await database();
    const tx = db.transaction(
      ["games", "puzzleAttempts", "lichessSync", "users"],
      "readwrite",
    );
    tx.objectStore("games").clear();
    tx.objectStore("puzzleAttempts").clear();
    tx.objectStore("lichessSync").clear();
    tx.objectStore("users").clear();
    await transactionDone(tx);
  });

  it("loads games and puzzles for a Lichess-only user without any Chess.com account", async () => {
    mockSettings.current = {
      lichessUsername: "lichess_only",
    };

    const db = await database();
    const tx = db.transaction(["games", "puzzleAttempts", "lichessSync"], "readwrite");
    const game: NormalizedGame = {
      id: "lichess:g100",
      platform: "lichess",
      url: "https://lichess.org/g100",
      username: "lichess_only",
      endTime: 1710000000,
      localDate: "2024-03-09",
      timeClass: "blitz",
      timeControl: "180+0",
      rated: true,
      rules: "chess",
      playerColor: "white",
      result: "win",
      rawPlayerResult: "win",
      rawOpponentResult: "loss",
      termination: "Checkmate",
      playerRating: 1800,
      opponentRating: 1790,
      opponentUsername: "opp",
      whiteUsername: "lichess_only",
      blackUsername: "opp",
      whiteRating: 1800,
      blackRating: 1790,
      eco: "C50",
      openingName: "Italian Game",
      variation: null,
      pgn: null,
    };
    const puzzle: PuzzleAttempt = {
      id: "lichess:live:lichess_only:000a9:1",
      platform: "lichess",
      username: "lichess_only",
      puzzleId: "000a9",
      attemptedAt: 1710000500000,
      localDate: "2024-03-09",
      result: "solved",
      ratingBefore: 1900,
      ratingAfter: 1910,
      ratingChange: 10,
      puzzleRating: 1850,
      source: "live_tracker",
      createdAt: 1710000500000,
    };
    tx.objectStore("games").put(game);
    tx.objectStore("puzzleAttempts").put(puzzle);
    tx.objectStore("lichessSync").put({
      username: "lichess_only",
      lastSuccessfulSync: 1710000900000,
      syncedYears: [2024, 2026],
    });
    await transactionDone(tx);

    const snap = await snapshot("lichess_only");
    expect(snap.games).toHaveLength(1);
    expect(snap.games[0].id).toBe("lichess:g100");
    expect(snap.lastSync).toBe(1710000900000);
    expect(snap.years).toContain(2024);

    const pSnap = await puzzleSnapshot("lichess_only");
    expect(pSnap.attempts).toHaveLength(1);
    expect(pSnap.attempts[0].puzzleId).toBe("000a9");
  });

  it("merges Chess.com and Lichess games & puzzles regardless of which platform queries the snapshot", async () => {
    mockSettings.current = {
      username: "chess_alice",
      lichessUsername: "lichess_alice",
    };

    const db = await database();
    const tx = db.transaction(["games", "puzzleAttempts"], "readwrite");
    tx.objectStore("games").put({
      id: "chesscom:1",
      platform: "chesscom",
      url: "https://www.chess.com/game/live/1",
      username: "chess_alice",
      endTime: 1710000000,
      localDate: "2024-03-09",
      timeClass: "rapid",
      timeControl: "600",
      rated: true,
      rules: "chess",
      playerColor: "white",
      result: "win",
      rawPlayerResult: "win",
      rawOpponentResult: "checkmated",
      termination: "Checkmate",
      playerRating: 1500,
      opponentRating: 1490,
      opponentUsername: "opp1",
      whiteUsername: "chess_alice",
      blackUsername: "opp1",
      whiteRating: 1500,
      blackRating: 1490,
      eco: null,
      openingName: null,
      variation: null,
      pgn: null,
    } satisfies NormalizedGame);
    tx.objectStore("games").put({
      id: "lichess:2",
      platform: "lichess",
      url: "https://lichess.org/2",
      username: "lichess_alice",
      endTime: 1710003600,
      localDate: "2024-03-09",
      timeClass: "blitz",
      timeControl: "180+0",
      rated: true,
      rules: "chess",
      playerColor: "black",
      result: "win",
      rawPlayerResult: "win",
      rawOpponentResult: "loss",
      termination: "Resignation",
      playerRating: 1750,
      opponentRating: 1740,
      opponentUsername: "opp2",
      whiteUsername: "opp2",
      blackUsername: "lichess_alice",
      whiteRating: 1740,
      blackRating: 1750,
      eco: null,
      openingName: null,
      variation: null,
      pgn: null,
    } satisfies NormalizedGame);
    await transactionDone(tx);

    const fromLichess = await snapshot("lichess_alice");
    const fromChessCom = await snapshot("chess_alice");
    expect(fromLichess.games.map((g) => g.id)).toEqual([
      "chesscom:1",
      "lichess:2",
    ]);
    expect(fromChessCom.games.map((g) => g.id)).toEqual([
      "chesscom:1",
      "lichess:2",
    ]);
  });

  it("renders Lichess onboarding setup with optional Personal Access Token when hostPlatform is lichess", () => {
    const state: DataState = {
      data: { games: [], years: [2026], lastSync: 0, version: 0 },
      username: "",
      settingsLoaded: true,
      loading: false,
      error: "",
      refresh: async () => {},
      connect: async () => true,
    };
    const html = renderToStaticMarkup(
      <Setup state={state} detected="lichess_user" hostPlatform="lichess" />,
    );
    expect(html).toContain("Lichess username");
    expect(html).toContain("Personal Access Token");
    expect(html).toContain("puzzle:read");
  });

  it("paginates Lichess games across full 300-game pages and backfills requested historical years", async () => {
    const page1 = Array.from({ length: 300 }, (_, i) => ({
      id: `g_p1_${i}`,
      rated: true,
      variant: "standard",
      speed: "blitz",
      createdAt: 1740000000000 - i * 1000,
      lastMoveAt: 1740000000000 - i * 1000 + 500,
      status: "mate",
      winner: "white" as const,
      players: {
        white: { user: { id: "alice", name: "Alice" }, rating: 1800 },
        black: { user: { id: "opp", name: "Opp" }, rating: 1780 },
      },
    }));
    const page2 = [
      {
        id: "g_p2_last",
        rated: true,
        variant: "standard",
        speed: "rapid",
        createdAt: 1739000000000,
        lastMoveAt: 1739000000500,
        status: "resign",
        winner: "black" as const,
        players: {
          white: { user: { id: "opp", name: "Opp" }, rating: 1780 },
          black: { user: { id: "alice", name: "Alice" }, rating: 1805 },
        },
      },
    ];
    const year2024Game = [
      {
        id: "g_2024_1",
        rated: true,
        variant: "standard",
        speed: "blitz",
        createdAt: Date.UTC(2024, 5, 15),
        lastMoveAt: Date.UTC(2024, 5, 15) + 60000,
        status: "mate",
        winner: "white" as const,
        players: {
          white: { user: { id: "alice", name: "Alice" }, rating: 1750 },
          black: { user: { id: "opp24", name: "Opp24" }, rating: 1740 },
        },
      },
    ];

    const gamesSpy = vi
      .spyOn(lichessApi, "getLichessGames")
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(year2024Game);

    try {
      const res = await syncLichessData("alice", undefined, false, undefined, [
        2024,
      ]);
      expect(res.newGames).toBe(302);
      expect(gamesSpy).toHaveBeenCalledTimes(3);
      // 2nd call uses `until` = oldest createdAt from page1 - 1
      const oldestPage1 = page1[page1.length - 1].createdAt;
      expect(gamesSpy.mock.calls[1][2]).toBe(oldestPage1 - 1);
      // 3rd call fetches year 2024 range
      expect(gamesSpy.mock.calls[2][1]).toBe(Date.UTC(2024, 0, 1));
      expect(gamesSpy.mock.calls[2][2]).toBe(Date.UTC(2025, 0, 1) - 1);

      const syncState = await getLichessSyncState("alice");
      expect(syncState?.syncedYears).toContain(2024);
    } finally {
      gamesSpy.mockRestore();
    }
  });

  it("hides platform filter pill, platform badges, and cross-platform popup settings in single-platform editions", async () => {
    const state: DataState = {
      data: { games: [], years: [2026], lastSync: 0, version: 1 },
      username: "alice",
      settingsLoaded: true,
      loading: false,
      error: "",
      refresh: async () => {},
      connect: async () => true,
    };

    const allHtml = renderToStaticMarkup(
      <HomepageHeatmap state={state} detected="alice" edition="all" />,
    );
    const chessOnlyHtml = renderToStaticMarkup(
      <HomepageHeatmap state={state} detected="alice" edition="chesscom" />,
    );
    const lichessOnlyHtml = renderToStaticMarkup(
      <HomepageHeatmap
        state={state}
        detected="alice"
        hostPlatform="lichess"
        edition="lichess"
      />,
    );

    expect(allHtml).toContain('aria-label="Platform"');
    expect(chessOnlyHtml).not.toContain('aria-label="Platform"');
    expect(lichessOnlyHtml).not.toContain('aria-label="Platform"');

    // Verify DayDetail hides platform badges in single-platform editions
    const sampleGames: NormalizedGame[] = [
      {
        id: "lichess:g1",
        platform: "lichess",
        url: "https://lichess.org/g1",
        username: "alice",
        endTime: 1710000000,
        localDate: "2024-03-09",
        timeClass: "blitz",
        timeControl: "180+0",
        rated: true,
        rules: "chess",
        playerColor: "white",
        result: "win",
        rawPlayerResult: "win",
        rawOpponentResult: "loss",
        termination: "Checkmate",
        playerRating: 1800,
        opponentRating: 1780,
        opponentUsername: "opp",
        whiteUsername: "alice",
        blackUsername: "opp",
        whiteRating: 1800,
        blackRating: 1780,
        eco: null,
        openingName: null,
        variation: null,
        pgn: null,
      },
    ];
    const detailAll = renderToStaticMarkup(
      <DayDetail
        date="2024-03-09"
        games={sampleGames}
        attempts={[]}
        onClose={() => {}}
        edition="all"
      />,
    );
    const detailLichess = renderToStaticMarkup(
      <DayDetail
        date="2024-03-09"
        games={sampleGames}
        attempts={[]}
        onClose={() => {}}
        edition="lichess"
      />,
    );
    expect(detailAll).toContain("ci-badge-platform");
    expect(detailLichess).not.toContain("ci-badge-platform");

    // Verify Popup renders only relevant platform sections per edition
    const popupAll = renderToStaticMarkup(<Popup edition="all" />);
    const popupChess = renderToStaticMarkup(<Popup edition="chesscom" />);
    const popupLichess = renderToStaticMarkup(<Popup edition="lichess" />);

    expect(popupAll).toContain("Chess.com Account");
    expect(popupAll).toContain("Lichess Integration");

    expect(popupChess).toContain("Chess.com Heatmap");
    expect(popupChess).toContain("Chess.com Account");
    expect(popupChess).not.toContain("Lichess");

    expect(popupLichess).toContain("Lichess Heatmap");
    expect(popupLichess).toContain("Lichess Account");
    expect(popupLichess).not.toContain("Chess.com Account");

    // Verify snapshot() respects single-platform edition override
    mockSettings.current = {
      username: "chess_alice",
      lichessUsername: "lichess_alice",
    };
    const db = await database();
    const tx = db.transaction(["games"], "readwrite");
    tx.objectStore("games").put({
      ...sampleGames[0],
      id: "chesscom:c1",
      platform: "chesscom",
      username: "chess_alice",
    });
    tx.objectStore("games").put({
      ...sampleGames[0],
      id: "lichess:l1",
      platform: "lichess",
      username: "lichess_alice",
    });
    await transactionDone(tx);

    const g = globalThis as { __TEST_CHESS_HEATMAP_EDITION__?: Edition };
    try {
      g.__TEST_CHESS_HEATMAP_EDITION__ = "chesscom";
      const snapChess = await snapshot("chess_alice");
      expect(snapChess.games.map((gm) => gm.id)).toEqual(["chesscom:c1"]);

      g.__TEST_CHESS_HEATMAP_EDITION__ = "lichess";
      const snapLichess = await snapshot("lichess_alice");
      expect(snapLichess.games.map((gm) => gm.id)).toEqual(["lichess:l1"]);
    } finally {
      delete g.__TEST_CHESS_HEATMAP_EDITION__;
    }
  });
});
