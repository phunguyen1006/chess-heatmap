import type { Platform } from "./types";

export type Edition = "all" | "chesscom" | "lichess";

declare const __CHESS_HEATMAP_EDITION__: Edition | undefined;

export function getEdition(): Edition {
  const testOverride = (
    globalThis as { __TEST_CHESS_HEATMAP_EDITION__?: Edition }
  ).__TEST_CHESS_HEATMAP_EDITION__;
  if (
    testOverride === "chesscom" ||
    testOverride === "lichess" ||
    testOverride === "all"
  ) {
    return testOverride;
  }
  if (
    typeof __CHESS_HEATMAP_EDITION__ !== "undefined" &&
    (__CHESS_HEATMAP_EDITION__ === "chesscom" ||
      __CHESS_HEATMAP_EDITION__ === "lichess" ||
      __CHESS_HEATMAP_EDITION__ === "all")
  ) {
    return __CHESS_HEATMAP_EDITION__;
  }
  return "all";
}

export function isSinglePlatformEdition(
  edition: Edition = getEdition(),
): edition is Platform {
  return edition === "chesscom" || edition === "lichess";
}
