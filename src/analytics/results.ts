import type { NormalizedGame } from "../shared/types";

export function results(games: NormalizedGame[]) {
  const wins = games.filter((g) => g.result === "win").length,
    draws = games.filter((g) => g.result === "draw").length;
  return {
    games: games.length,
    wins,
    draws,
    losses: games.length - wins - draws,
    winRate: games.length ? (wins / games.length) * 100 : 0,
  };
}
