import { useEffect, useMemo, useState } from "react";
import type { DataState } from "../state/useData";
import { combinedActivity } from "../../analytics/puzzles";
import type { ActivityMode } from "../../analytics/puzzles";
import { usePuzzleData } from "../state/usePuzzleData";
import { localDate } from "../../shared/dates";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { Setup } from "../components/Setup";
import { DayDetail } from "./DayDetail";

export function HomepageHeatmap({
  state,
  detected,
}: {
  state: DataState;
  detected: string | null;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<ActivityMode>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();
  const isCurrentYear = year === currentYear;
  const { data, username, loading, error, refresh } = state;
  const puzzles = usePuzzleData(username);

  const attempts = useMemo(
    () =>
      puzzles.data.attempts.filter(
        (a) => Number(a.localDate.slice(0, 4)) === year,
      ),
    [puzzles.data.attempts, year],
  );

  const games = useMemo(
    () => data.games.filter((g) => Number(g.localDate.slice(0, 4)) === year),
    [data.games, year],
  );

  const stats = useMemo(
    () => combinedActivity(games, attempts),
    [games, attempts],
  );

  const gameStats = useMemo(() => combinedActivity(games, []), [games]);
  const puzzleStats = useMemo(() => combinedActivity([], attempts), [attempts]);
  const activeStats =
    mode === "games" ? gameStats : mode === "puzzles" ? puzzleStats : stats;

  useEffect(() => {
    if (username) void refresh([year]);
  }, [year, username, refresh]);

  return (
    <section className="ci-scope ci-home-card">
      <header className="ci-row">
        <h2>Chess Activity</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className="ci-mode-pills" role="tablist" aria-label="Activity type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "all"}
              className={`ci-mode-pill ${mode === "all" ? "ci-active" : ""}`}
              onClick={() => setMode("all")}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "games"}
              className={`ci-mode-pill ${mode === "games" ? "ci-active" : ""}`}
              onClick={() => setMode("games")}
            >
              Games
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "puzzles"}
              className={`ci-mode-pill ${mode === "puzzles" ? "ci-active" : ""}`}
              onClick={() => setMode("puzzles")}
            >
              Puzzles
            </button>
          </div>
          <label className="ci-year">
            Year{" "}
            <select
              aria-label="Activity year"
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setSelectedDate(null);
              }}
            >
              {[...new Set([year, ...data.years])]
                .sort((a, b) => b - a)
                .map((y) => (
                  <option key={y}>{y}</option>
                ))}
            </select>
          </label>
        </div>
      </header>

      {!state.settingsLoaded ? (
        <p className="ci-summary">Loading local history…</p>
      ) : !username ? (
        <Setup state={state} detected={detected} />
      ) : (
        <>
          <p className="ci-summary">
            {loading && !games.length ? (
              "Loading statistics…"
            ) : (
              <>
                {mode !== "puzzles" && (
                  <span>{stats.games.toLocaleString()} games · </span>
                )}
                {mode !== "games" && (
                  <span>
                    {stats.puzzles > 0
                      ? `${stats.puzzles.toLocaleString()} puzzles · `
                      : isCurrentYear && puzzles.data.tracking
                        ? `Puzzle tracking started${puzzles.data.tracking.puzzleTrackingStartedLocalDate === localDate(new Date()) ? " today" : ""} · `
                        : mode === "puzzles"
                          ? "0 puzzles · "
                          : ""}
                  </span>
                )}
                {activeStats.activeDays}{" "}
                <span className="ci-summary-detail">active </span>
                days ·{" "}
                {isCurrentYear ? (
                  <>
                    {activeStats.current > 0 ? `${activeStats.current} day streak · ` : ""}
                    {activeStats.longest}{" "}
                    <span className="ci-summary-detail">day </span>longest streak
                  </>
                ) : (
                  <>
                    {activeStats.longest}{" "}
                    <span className="ci-summary-detail">day </span>longest streak
                  </>
                )}
              </>
            )}
            {loading && <span className="ci-muted"> · Updating…</span>}
          </p>

          <ActivityHeatmap
            compact
            games={games}
            attempts={attempts}
            mode={mode}
            trackingSince={
              puzzles.data.tracking?.puzzleTrackingStartedLocalDate
            }
            year={year}
            onDate={(d) => setSelectedDate((prev) => (prev === d ? null : d))}
          />

          {selectedDate && (
            <DayDetail
              date={selectedDate}
              games={games}
              attempts={attempts}
              onClose={() => setSelectedDate(null)}
            />
          )}

          {!games.length && !attempts.length && !loading && (
            <div className="ci-empty-inline">
              No games found for {year}.{" "}
              <button onClick={() => setYear(year - 1)}>Previous year</button>
            </div>
          )}

          {error && (
            <p className="ci-status" role="status">
              {error}{" "}
              {data.lastSync
                ? `Cached data from ${new Date(data.lastSync).toLocaleTimeString()}.`
                : ""}
              <button
                disabled={loading}
                onClick={() => void refresh([year], true)}
              >
                Retry
              </button>
            </p>
          )}

          <footer className="ci-row">
            <button
              type="button"
              className="ci-link-button"
              disabled={loading}
              onClick={() => void refresh([year], true)}
            >
              {loading ? "Syncing…" : "↻ Refresh sync"}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
