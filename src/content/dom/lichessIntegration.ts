import {
  getLichessMain,
  lichessTarget,
  lichessLiveContext,
  isLichessMountRoute,
  LOWER_LOBBY_SELECTORS,
  IDS,
} from "./lichessDom";
import type { LichessMountTarget } from "./lichessDom";
import type { MountHandlers } from "./integration";
import { version } from "../../../package.json";

export const LAYOUT_BUILD = version;

const DEFAULT_TOP_AREAS = new Set([
  "app",
  "table",
  "counters",
  "under-table",
  "under_table",
  "undertable",
  "start",
  "hooks",
  "pools",
  "side",
  "timeline",
  "streams",
  "spotlights",
  "tv",
  "quick",
]);

const AREA_IDENT = /^[a-zA-Z_-][a-zA-Z0-9_-]*$/;

export function parseGridTemplateAreas(raw: string): string[][] | null {
  if (!raw || raw === "none") return null;
  const matches = [...raw.matchAll(/"([^"]+)"/g)];
  if (matches.length === 0) return null;
  const rows = matches.map((m) => m[1].trim().split(/\s+/).filter(Boolean));
  const cols = rows[0]?.length ?? 0;
  if (cols === 0 || rows.some((r) => r.length !== cols)) return null;
  return rows;
}

function extractElementAreaName(el: HTMLElement): string | null {
  const cs = getComputedStyle(el);
  const candidates = [
    el.style.gridArea,
    cs.gridArea,
    cs.gridRowStart,
    cs.gridColumnStart,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const token = raw.split("/")[0]?.trim() ?? "";
    if (
      token &&
      token !== "auto" &&
      !token.startsWith("span") &&
      AREA_IDENT.test(token)
    ) {
      return token;
    }
  }
  return null;
}

export function unifyCenterColumnGridAreas(
  rows: string[][],
  primaryArea: string,
  centerAreas: Set<string>,
): string[][] | null {
  const next = rows.map((r) =>
    r.map((token) => (centerAreas.has(token) ? primaryArea : token)),
  );
  let targetCol = -1;
  let minRow = Infinity;
  let maxRow = -1;
  next.forEach((r, rIdx) => {
    r.forEach((token, cIdx) => {
      if (token === primaryArea) {
        if (targetCol === -1) targetCol = cIdx;
        if (cIdx === targetCol) {
          if (rIdx < minRow) minRow = rIdx;
          if (rIdx > maxRow) maxRow = rIdx;
        }
      }
    });
  });
  if (targetCol === -1 || maxRow < minRow) return null;
  for (let r = minRow; r <= maxRow; r++) {
    next[r][targetCol] = primaryArea;
  }
  return next;
}

export function buildLobbyGridAreas(
  rows: string[][],
  host: HTMLElement,
  topCards: HTMLElement[] = [],
): {
  topRows: string[][];
  heatmapRow: string[];
  bottomRows: string[][];
  nextRows: string[][];
  insertIdx: number;
} {
  const cols = rows[0].length;
  const topAreas = new Set(DEFAULT_TOP_AREAS);

  for (const card of topCards) {
    const name = extractElementAreaName(card);
    if (name) topAreas.add(name);
  }

  const lowerSelector = LOWER_LOBBY_SELECTORS.join(",");
  for (const child of host.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.matches(lowerSelector)) {
      const name = extractElementAreaName(child);
      if (name && name !== "app" && name !== "table") {
        topAreas.delete(name);
      }
    }
  }

  let lastTopRow = -1;
  let firstBottomRow = -1;
  let lastBottomRow = -1;

  rows.forEach((r, idx) => {
    if (r.some((t) => topAreas.has(t))) {
      lastTopRow = idx;
    }
    if (r.some((t) => t !== "." && !topAreas.has(t))) {
      if (firstBottomRow === -1) firstBottomRow = idx;
      lastBottomRow = idx;
    }
  });

  if (lastTopRow === -1) {
    const heatmapRow = Array.from({ length: cols }, () => "ci_heatmap");
    return {
      topRows: rows,
      heatmapRow,
      bottomRows: [],
      nextRows: [...rows, heatmapRow],
      insertIdx: rows.length,
    };
  }

  const topRows = rows
    .slice(0, lastTopRow + 1)
    .map((r) => r.map((t) => (topAreas.has(t) ? t : ".")));

  const bottomRows =
    firstBottomRow >= 0
      ? rows
          .slice(firstBottomRow, lastBottomRow + 1)
          .map((r) => r.map((t) => (t !== "." && !topAreas.has(t) ? t : ".")))
      : [];

  if (bottomRows.length > 1) {
    for (let c = 0; c < cols; c++) {
      if (bottomRows[0][c] !== ".") continue;
      let firstNonDotRow = -1;
      for (let r = 1; r < bottomRows.length; r++) {
        if (bottomRows[r][c] !== ".") {
          firstNonDotRow = r;
          break;
        }
      }
      if (firstNonDotRow > 0) {
        const token = bottomRows[firstNonDotRow][c];
        const isSingleCol = bottomRows.every((row) =>
          row.every((cell, colIdx) => colIdx === c || cell !== token),
        );
        if (isSingleCol) {
          for (let r = 0; r < firstNonDotRow; r++) {
            bottomRows[r][c] = token;
          }
        }
      }
    }
  }

  const heatmapRow = Array.from({ length: cols }, () => "ci_heatmap");
  const nextRows = [...topRows, heatmapRow, ...bottomRows];

  return {
    topRows,
    heatmapRow,
    bottomRows,
    nextRows,
    insertIdx: topRows.length,
  };
}

export function integrateLichess(handlers: MountHandlers) {
  let main: HTMLElement | null = null,
    homeRoot: HTMLElement | null = null;
  let target: LichessMountTarget | null = null;
  let routeKey = "";
  let sizing: ResizeObserver | null = null;
  let column: HTMLElement | null = null;
  const wrappedCards: {
    node: HTMLElement;
    marker: Comment;
    style: string;
  }[] = [];
  const nativeHostStyles = new Map<
    HTMLElement,
    { property: string; value: string; priority: string }[]
  >();

  const saveHostProperties = (host: HTMLElement, properties: string[]) => {
    const existing = nativeHostStyles.get(host) ?? [];
    const recorded = new Set(existing.map((p) => p.property));
    const additions = properties
      .filter((p) => !recorded.has(p))
      .map((property) => ({
        property,
        value: host.style.getPropertyValue(property),
        priority: host.style.getPropertyPriority(property),
      }));
    nativeHostStyles.set(host, [...existing, ...additions]);
  };

  const sizeHeatmap = () => {
    if (!homeRoot || !target) return;
    homeRoot.style.width = "100%";
  };

  const remove = () => {
    if (homeRoot) {
      handlers.unmount(homeRoot);
      homeRoot.remove();
      homeRoot = null;
    }
    sizing?.disconnect();
    sizing = null;
    for (const { node, marker, style } of wrappedCards) {
      node.style.cssText = style;
      if (marker.isConnected) marker.replaceWith(node);
    }
    wrappedCards.length = 0;
    column?.remove();
    column = null;
    nativeHostStyles.forEach((properties, host) => {
      properties.forEach(({ property, value, priority }) => {
        if (value) host.style.setProperty(property, value, priority);
        else host.style.removeProperty(property);
      });
    });
    nativeHostStyles.clear();
    target = null;
  };

  const update = () => {
    const next = getLichessMain(),
      live = lichessLiveContext();
    if (next !== main) {
      remove();
      main = next;
      target = null;
    }
    if (!main || live || !isLichessMountRoute()) {
      remove();
      return;
    }
    if (
      homeRoot &&
      (!homeRoot.isConnected ||
        !target?.parent.isConnected ||
        (target.before && !target.before.isConnected) ||
        (target.playArea && !target.playArea.isConnected) ||
        target.cards?.some((card) => !card.isConnected))
    ) {
      remove();
    }

    const key = location.pathname + location.hash;
    if (key !== routeKey) {
      remove();
      routeKey = key;
      target = null;
    }

    if (
      !target ||
      !target.parent.isConnected ||
      (target.before && !target.before.isConnected)
    ) {
      target = lichessTarget(main);
    }

    if (!target) {
      remove();
      return;
    }

    if (!homeRoot) {
      if (target.wrap && target.before) {
        const host = target.parent;
        const centerCards =
          target.cards && target.cards.length > 0
            ? target.cards
            : [target.before];
        const feedCard = centerCards[0];
        const nativeStyle = getComputedStyle(feedCard);
        const origFeedHeight = feedCard.getBoundingClientRect().height;
        const gridArea = feedCard.style.gridArea || nativeStyle.gridArea;
        const gridColumn = feedCard.style.gridColumn || nativeStyle.gridColumn;
        const gridRow = feedCard.style.gridRow || nativeStyle.gridRow;
        const gridRowStart = nativeStyle.gridRowStart;
        const gridRowEnd = nativeStyle.gridRowEnd;
        const gridColumnStart = nativeStyle.gridColumnStart;
        const gridColumnEnd = nativeStyle.gridColumnEnd;

        const primaryArea = extractElementAreaName(feedCard) ?? "feed";
        const centerAreas = new Set<string>([primaryArea, "feed", "blog"]);
        for (const card of centerCards) {
          const name = extractElementAreaName(card);
          if (name) centerAreas.add(name);
        }

        // Unify "feed" and "blog" (and any other wrapped center-column areas) in
        // host's grid-template-areas so the center flex column spans continuously
        // down the center column without overflowing onto lower rows.
        const hostStyle = getComputedStyle(host);
        const rows = parseGridTemplateAreas(
          hostStyle.gridTemplateAreas || host.style.gridTemplateAreas,
        );
        if (rows) {
          const unified = unifyCenterColumnGridAreas(
            rows,
            primaryArea,
            centerAreas,
          );
          if (unified) {
            saveHostProperties(host, ["grid-template-areas"]);
            host.style.setProperty(
              "grid-template-areas",
              unified.map((r) => `"${r.join(" ")}"`).join(" "),
              "important",
            );
          }
        }

        column = document.createElement("div");
        column.className = "ci-native-column ci-lichess-center-column";
        column.style.cssText =
          "min-width:0;min-height:0;width:100%;height:auto;display:flex;flex-direction:column;gap:12px;position:relative;box-sizing:border-box;align-self:start;";

        const hasNamedArea =
          gridArea &&
          gridArea !== "auto" &&
          !gridArea.startsWith("auto ") &&
          gridArea !== "auto / auto / auto / auto";
        if (hasNamedArea) {
          column.style.setProperty("grid-area", gridArea, "important");
        } else {
          column.style.setProperty("grid-area", primaryArea, "important");
          if (
            gridColumn &&
            gridColumn !== "auto" &&
            !gridColumn.startsWith("auto ")
          )
            column.style.setProperty("grid-column", gridColumn, "important");
          if (gridRow && gridRow !== "auto" && !gridRow.startsWith("auto "))
            column.style.setProperty("grid-row", gridRow, "important");
          if (gridRowStart && gridRowStart !== "auto")
            column.style.setProperty(
              "grid-row-start",
              gridRowStart,
              "important",
            );
          if (gridRowEnd && gridRowEnd !== "auto")
            column.style.setProperty("grid-row-end", gridRowEnd, "important");
          if (gridColumnStart && gridColumnStart !== "auto")
            column.style.setProperty(
              "grid-column-start",
              gridColumnStart,
              "important",
            );
          if (gridColumnEnd && gridColumnEnd !== "auto")
            column.style.setProperty(
              "grid-column-end",
              gridColumnEnd,
              "important",
            );
        }

        host.insertBefore(column, feedCard);

        centerCards.forEach((card, idx) => {
          const marker = document.createComment(
            "Chess Heatmap: center column card",
          );
          wrappedCards.push({
            node: card,
            marker,
            style: card.style.cssText,
          });
          card.before(marker);
          column!.append(card);

          card.style.setProperty("grid-area", "auto", "important");
          card.style.setProperty("grid-column", "auto", "important");
          card.style.setProperty("grid-row", "auto", "important");
          card.style.setProperty("position", "relative", "important");
          card.style.setProperty("inset", "auto", "important");
          card.style.setProperty("transform", "none", "important");
          card.style.setProperty("width", "100%", "important");
          card.style.setProperty("min-width", "0", "important");
          card.style.setProperty("flex", "0 0 auto", "important");
          card.style.setProperty("margin", "0", "important");
          card.style.setProperty("box-sizing", "border-box", "important");

          if (idx === 0) {
            // Preserve the native ~205px scrollable height of .lobby__feed ("13 hours ago")
            const targetHeight =
              origFeedHeight > 120 ? Math.round(origFeedHeight) : 205;
            card.style.setProperty("height", `${targetHeight}px`, "important");
            card.style.setProperty(
              "max-height",
              `${targetHeight}px`,
              "important",
            );
            card.style.setProperty("overflow-y", "auto", "important");
          } else {
            card.style.setProperty("height", "auto", "important");
            card.style.setProperty("max-height", "none", "important");
          }
        });

        target = {
          ...target,
          parent: column,
          before: feedCard,
          wrap: false,
        };
      }

      const existing = document.getElementById(IDS.home);
      if (existing) {
        homeRoot = existing;
        target.parent.insertBefore(homeRoot, target.before);
        return;
      }

      homeRoot = document.createElement("div");
      homeRoot.id = IDS.home;
      homeRoot.dataset.mountStrategy = target.strategy;
      homeRoot.dataset.layoutBuild = LAYOUT_BUILD;
      homeRoot.style.cssText = column
        ? "width:100%;min-width:0;box-sizing:border-box;position:relative;display:block;flex:0 0 auto;z-index:auto;margin:0;"
        : "width:100%;min-width:0;box-sizing:border-box;position:relative;display:block;flex:0 0 auto;grid-column:1 / -1;z-index:auto;margin:16px 0;";

      if (target.strategy === "lichess-lobby" && !column) {
        const host = target.parent;
        const inlineRowsBefore = host.style.gridTemplateRows.trim();
        const style = getComputedStyle(host);
        const rows = parseGridTemplateAreas(
          style.gridTemplateAreas || host.style.gridTemplateAreas,
        );
        if (rows) {
          const { nextRows, insertIdx } = buildLobbyGridAreas(
            rows,
            host,
            target.cards ?? [target.row],
          );

          saveHostProperties(host, [
            "grid-template-areas",
            "grid-template-rows",
          ]);
          host.style.setProperty(
            "grid-template-areas",
            nextRows.map((r) => `"${r.join(" ")}"`).join(" "),
            "important",
          );
          if (inlineRowsBefore && inlineRowsBefore !== "none") {
            const tracks = inlineRowsBefore.split(/\s+/);
            if (tracks.length === rows.length) {
              const nextTracks = [
                ...tracks.slice(0, insertIdx),
                "auto",
                ...tracks.slice(insertIdx),
              ];
              host.style.setProperty(
                "grid-template-rows",
                nextTracks.join(" "),
                "important",
              );
            }
          } else {
            host.style.setProperty(
              "grid-template-rows",
              nextRows.map(() => "auto").join(" "),
              "important",
            );
          }
          homeRoot.style.cssText =
            "width:100%;min-width:0;box-sizing:border-box;position:relative;display:block;flex:0 0 auto;z-index:auto;margin:8px 0;";
          homeRoot.style.setProperty("grid-area", "ci_heatmap", "important");
        }
      }

      target.parent.insertBefore(homeRoot, target.before);
      handlers.home(homeRoot);

      sizeHeatmap();
      if (typeof ResizeObserver !== "undefined") {
        sizing = new ResizeObserver(sizeHeatmap);
        sizing.observe(homeRoot);
        sizing.observe(target.row);
        sizing.observe(target.parent);
      }
    } else if (
      homeRoot.parentElement !== target.parent ||
      homeRoot.nextElementSibling !== target.before
    ) {
      target.parent.insertBefore(homeRoot, target.before);
    }
    sizeHeatmap();
  };

  return {
    update,
    getMountStatus: () => ({
      isMountRoute: isLichessMountRoute(),
      strategy: target?.strategy ?? null,
      centerColumnWrapped: !!column?.isConnected,
      wrappedCount: wrappedCards.length,
      heatmapMounted: !!document.getElementById(IDS.home),
      width: Math.round(
        document.getElementById(IDS.home)?.getBoundingClientRect().width ?? 0,
      ),
    }),
    remountHeatmap: () => {
      remove();
      update();
    },
    dispose: () => {
      remove();
    },
  };
}
