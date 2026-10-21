import { useMemo } from "react";
import type { NormalizedGame, PuzzleAttempt } from "../../shared/types";
import { displayDate } from "../../shared/dates";

interface DayDetailProps {
  date: string;
  games: NormalizedGame[];
  attempts: PuzzleAttempt[];
  onClose: () => void;
}

export function DayDetail({
  date,
  games,
  attempts,
  onClose,
}: DayDetailProps) {
  const dayGames = useMemo(
    () =>
      games
        .filter((g) => g.localDate === date)
        .sort((a, b) => b.endTime - a.endTime),
    [games, date],
  );

  const dayAttempts = useMemo(
    () =>
      attempts
        .filter((a) => a.localDate === date)
        .sort((a, b) => b.attemptedAt - a.attemptedAt),
    [attempts, date],
  );

  const wins = dayGames.filter((g) => g.result === "win").length;
  const losses = dayGames.filter((g) => g.result === "loss").length;
  const draws = dayGames.filter((g) => g.result === "draw").length;

  const solved = dayAttempts.filter((a) => a.result === "solved").length;
  const failed = dayAttempts.filter((a) => a.result === "failed").length;

  const timeClassIcon = (tc: string) => {
    switch (tc) {
      case "rapid":
        return "⏱️ Rapid";
      case "blitz":
        return "⚡ Blitz";
      case "bullet":
        return "🎯 Bullet";
      case "daily":
        return "📅 Daily";
      default:
        return "♟️ Chess";
    }
  };

  return (
    <div className="ci-day-detail" role="region" aria-label={`Activity for ${displayDate(date)}`}>
      <div className="ci-day-detail-header">
        <div>
          <h3>{displayDate(date)}</h3>
          <p className="ci-day-detail-stats">
            {dayGames.length > 0 && (
              <span>
                <strong>{dayGames.length}</strong> games ({wins}W · {draws}D · {losses}L)
              </span>
            )}
            {dayGames.length > 0 && dayAttempts.length > 0 && <span> · </span>}
            {dayAttempts.length > 0 && (
              <span>
                <strong>{dayAttempts.length}</strong> puzzles ({solved} solved · {failed} failed)
              </span>
            )}
            {!dayGames.length && !dayAttempts.length && (
              <span>No recorded activity on this date</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="ci-day-detail-close"
          onClick={onClose}
          aria-label="Close day activity"
          title="Close"
        >
          ✕
        </button>
      </div>

      {dayGames.length > 0 && (
        <div className="ci-day-detail-section">
          <h4>Games played</h4>
          <div className="ci-day-games-list">
            {dayGames.map((game) => (
              <div key={game.id} className="ci-day-game-card">
                <div className="ci-day-game-main">
                  <span
                    className={`ci-badge ci-badge-${game.result}`}
                    title={game.termination || game.result}
                  >
                    {game.result.toUpperCase()}
                  </span>
                  <span className="ci-day-game-speed">
                    {timeClassIcon(game.timeClass)}
                  </span>
                  <span
                    className="ci-day-game-color"
                    title={`Played as ${game.playerColor}`}
                  >
                    {game.playerColor === "white" ? "⚪ White" : "⚫ Black"}
                  </span>
                  <span className="ci-day-game-opponent">
                    vs <strong>{game.opponentUsername ?? "Unknown"}</strong>{" "}
                    {game.opponentRating !== null && `(${game.opponentRating})`}
                  </span>
                </div>
                <div className="ci-day-game-sub">
                  {game.openingName && (
                    <span className="ci-day-game-opening" title={game.openingName}>
                      {game.openingName}
                    </span>
                  )}
                  {game.termination && (
                    <span className="ci-day-game-term">
                      • {game.termination}
                    </span>
                  )}
                  {game.url && (
                    <a
                      href={game.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ci-day-game-link"
                    >
                      View on Chess.com ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dayAttempts.length > 0 && (
        <div className="ci-day-detail-section">
          <h4>Puzzle attempts</h4>
          <div className="ci-day-puzzles-list">
            {dayAttempts.map((attempt) => (
              <div key={attempt.id} className="ci-day-puzzle-item">
                <span
                  className={`ci-badge ci-badge-${attempt.result === "solved" ? "win" : attempt.result === "failed" ? "loss" : "draw"}`}
                >
                  {attempt.result.toUpperCase()}
                </span>
                {attempt.puzzleRating !== null && (
                  <span className="ci-day-puzzle-rating">
                    Rating: {attempt.puzzleRating}
                  </span>
                )}
                {attempt.ratingChange !== null && (
                  <span
                    className={`ci-day-rating-change ${attempt.ratingChange >= 0 ? "ci-rating-plus" : "ci-rating-minus"}`}
                  >
                    {attempt.ratingChange > 0 ? `+${attempt.ratingChange}` : attempt.ratingChange}
                  </span>
                )}
                {attempt.puzzleId && (
                  <a
                    href={`https://www.chess.com/puzzles/problem/${attempt.puzzleId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ci-day-game-link"
                  >
                    Puzzle #{attempt.puzzleId} ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
