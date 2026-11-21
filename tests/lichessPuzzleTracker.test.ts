// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLichessPuzzlePage,
  readLichessPuzzleObservation,
} from "../src/content/puzzles/lichessTracker";
import { PuzzleTrackerMachine } from "../src/content/puzzles/tracker";
import { deduplicatePuzzleAttempts } from "../src/data/storage/puzzleRepository";
import type { PuzzleAttempt } from "../src/shared/types";

const puzzleFixture = () => `
  <main class="puzzle puzzle-play">
    <aside class="puzzle__side">
      <div class="puzzle__side__box">
        <div class="puzzle__side__metas">
          <p>Puzzle <a href="/training/000a9">#000a9</a></p>
          <p class="rating">Rating: <strong>hidden</strong></p>
        </div>
      </div>
      <div class="puzzle__side__user">
        <div class="puzzle__side__user__rating">
          <strong>2045</strong>
        </div>
      </div>
    </aside>
    <div class="puzzle__main">
      <div class="cg-wrap"></div>
    </div>
    <div class="puzzle__controls">
      <div class="puzzle__feedback play">
        <div class="player">Your turn</div>
        Find the best move for White.
      </div>
    </div>
  </main>
`;

describe("Lichess live puzzle tracker & API deduplication", () => {
  beforeEach(() => {
    document.body.innerHTML = puzzleFixture();
    history.replaceState(null, "", "/training");
  });

  const root = () => document.querySelector<HTMLElement>("main.puzzle")!;
  const observe = () => readLichessPuzzleObservation(root());

  it("identifies standard Lichess training pages and excludes dashboards and arcade modes", () => {
    expect(isLichessPuzzlePage(document, "/training")).toBe(true);
    expect(isLichessPuzzlePage(document, "/training/000a9")).toBe(true);
    expect(isLichessPuzzlePage(document, "/training/mix")).toBe(true);
    expect(isLichessPuzzlePage(document, "/training/endgame")).toBe(true);
    expect(isLichessPuzzlePage(document, "/training/dashboard")).toBe(false);
    expect(isLichessPuzzlePage(document, "/training/themes")).toBe(false);
    expect(isLichessPuzzlePage(document, "/training/history")).toBe(false);
    expect(isLichessPuzzlePage(document, "/storm")).toBe(false);
    expect(isLichessPuzzlePage(document, "/streak")).toBe(false);
    expect(isLichessPuzzlePage(document, "/racer")).toBe(false);
  });

  it("ignores active and intermediate 'Best move! Keep going' states and records solved puzzles once completed", async () => {
    const save = vi.fn<(a: PuzzleAttempt) => Promise<unknown>>(
      async () => true,
    );
    const machine = new PuzzleTrackerMachine(save, undefined, null, "lichess");

    // 1. Initial active state
    expect(observe()).toEqual({
      puzzleId: "000a9",
      result: null,
      ratingChange: null,
      ratingAfter: null,
      puzzleRating: null,
    });
    await machine.observe("alice", observe());
    expect(save).not.toHaveBeenCalled();

    // 2. Intermediate good move in multi-move puzzle
    const feedback = root().querySelector(".puzzle__feedback")!;
    feedback.className = "puzzle__feedback play";
    feedback.innerHTML = '<div class="good">Best move! Keep going…</div>';
    expect(observe().result).toBeNull();
    await machine.observe("alice", observe());
    expect(save).not.toHaveBeenCalled();

    // 3. Puzzle completed (solved)
    feedback.className = "puzzle__feedback after";
    feedback.innerHTML =
      '<div class="complete">Success!</div><a class="continue">Continue training</a>';
    root().querySelector(".puzzle__side__metas .rating")!.innerHTML =
      "Rating: <strong>1980</strong>";
    root().querySelector(".puzzle__side__user__rating")!.innerHTML =
      '<strong>2057</strong><span class="rp up">+12</span>';

    const obs = observe();
    expect(obs).toEqual({
      puzzleId: "000a9",
      result: "solved",
      ratingChange: 12,
      ratingAfter: 2057,
      puzzleRating: 1980,
    });

    await machine.observe("alice", obs);
    await machine.observe("alice", obs);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      platform: "lichess",
      username: "alice",
      puzzleId: "000a9",
      result: "solved",
      ratingBefore: 2045,
      ratingAfter: 2057,
      ratingChange: 12,
      puzzleRating: 1980,
      source: "live_tracker",
    });
    expect(save.mock.calls[0][0].id).toMatch(/^lichess:live:alice:000a9:/);
  });

  it("records a failed puzzle on wrong move and never counts viewing the solution afterwards as solved", async () => {
    const save = vi.fn<(a: PuzzleAttempt) => Promise<unknown>>(
      async () => true,
    );
    const machine = new PuzzleTrackerMachine(save, undefined, null, "lichess");

    await machine.observe("alice", observe());
    expect(save).not.toHaveBeenCalled();

    // Wrong move -> .puzzle__feedback.fail with View the solution button
    const feedback = root().querySelector(".puzzle__feedback")!;
    feedback.className = "puzzle__feedback fail";
    feedback.innerHTML =
      '<div class="bad">Not the move!</div><button class="view_solution">View the solution</button>';
    root().querySelector(".puzzle__side__user__rating")!.innerHTML =
      '<strong>2031</strong><span class="rp down">-14</span>';

    await machine.observe("alice", observe());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      platform: "lichess",
      username: "alice",
      puzzleId: "000a9",
      result: "failed",
      ratingBefore: 2045,
      ratingAfter: 2031,
      ratingChange: -14,
    });

    // User clicks "View the solution" -> transitions to .puzzle__feedback.after
    feedback.className = "puzzle__feedback after";
    feedback.innerHTML =
      '<div class="complete">Puzzle complete</div><a class="continue">Continue training</a>';
    await machine.observe("alice", observe());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("deduplicates live_tracker and lichess_api puzzle attempts while preserving live rating deltas", () => {
    const liveAttempt: PuzzleAttempt = {
      id: "lichess:live:alice:000a9:uuid-1",
      platform: "lichess",
      username: "alice",
      puzzleId: "000a9",
      attemptedAt: 1710000005000,
      localDate: "2024-03-09",
      result: "solved",
      ratingBefore: 2045,
      ratingAfter: 2057,
      ratingChange: 12,
      puzzleRating: 1980,
      source: "live_tracker",
      createdAt: 1710000005000,
    };
    const apiAttempt: PuzzleAttempt = {
      id: "lichess:puzzle:000a9:1710000000000",
      platform: "lichess",
      username: "alice",
      puzzleId: "000a9",
      attemptedAt: 1710000000000,
      localDate: "2024-03-09",
      result: "solved",
      ratingBefore: null,
      ratingAfter: null,
      ratingChange: null,
      puzzleRating: 1980,
      source: "lichess_api",
      createdAt: 1710000100000,
    };
    const otherLiveAttempt: PuzzleAttempt = {
      id: "lichess:live:alice:000b1:uuid-2",
      platform: "lichess",
      username: "alice",
      puzzleId: "000b1",
      attemptedAt: 1710000200000,
      localDate: "2024-03-09",
      result: "failed",
      ratingBefore: 2057,
      ratingAfter: 2043,
      ratingChange: -14,
      puzzleRating: 2100,
      source: "live_tracker",
      createdAt: 1710000200000,
    };

    const deduped = deduplicatePuzzleAttempts([
      liveAttempt,
      apiAttempt,
      otherLiveAttempt,
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]).toMatchObject({
      id: "lichess:puzzle:000a9:1710000000000",
      puzzleId: "000a9",
      source: "lichess_api",
      ratingBefore: 2045,
      ratingAfter: 2057,
      ratingChange: 12,
      puzzleRating: 1980,
    });
    expect(deduped[1].puzzleId).toBe("000b1");
  });
});
