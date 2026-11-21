import type {
  PuzzleAttempt,
  PuzzleSnapshot,
  Settings,
} from "../../shared/types";
import { localDate } from "../../shared/dates";
import { send } from "../../features/state/client";
import { detectLichessUsername } from "../dom/lichessDom";
import { puzzleResults } from "../../analytics/puzzles";
import {
  SETTINGS_KEY,
  PUZZLE_CHANGE_KEY,
  LICHESS_CHANGE_KEY,
} from "../../shared/constants";
import { PuzzleTrackerMachine } from "./tracker";
import type { PuzzleObservation } from "./tracker";

const LICHESS_PUZZLE_THEMES = new Set([
  "mix",
  "healthymix",
  "opening",
  "middlegame",
  "endgame",
  "rookendgame",
  "bishopendgame",
  "pawnendgame",
  "knightendgame",
  "queenendgame",
  "queenrookendgame",
  "mate",
  "matein1",
  "matein2",
  "matein3",
  "matein4",
  "matein5",
  "anastasiamate",
  "arabianmate",
  "backrankmate",
  "bodenmate",
  "doublebishopmate",
  "dovetailmate",
  "hookmate",
  "smotheredmate",
  "fork",
  "pin",
  "skewer",
  "sacrifice",
  "discoveredattack",
  "deflection",
  "attraction",
  "clearance",
  "interference",
  "intermezzo",
  "zugzwang",
  "quietmove",
  "defensivemove",
  "advancedpawn",
  "hangingpiece",
  "trappedpiece",
  "exposedking",
  "kingsideattack",
  "queensideattack",
  "short",
  "long",
  "verylong",
  "onemove",
  "master",
  "mastervsmaster",
  "supergm",
  "crushing",
  "advantage",
  "equality",
  "castling",
  "enpassant",
  "promotion",
  "underpromotion",
  "capturingdefender",
  "doublecheck",
  "xrayattack",
  "themes",
  "dashboard",
  "history",
  "replay",
  "streak",
  "storm",
  "racer",
]);

const visible = (e: Element) => {
  for (let node: Element | null = e; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      node.matches('[hidden],[aria-hidden="true"]') ||
      style?.display === "none" ||
      style?.visibility === "hidden"
    )
      return false;
  }
  return true;
};

export function lichessPuzzleRoot(
  doc: Document = document,
  path = location.pathname,
): HTMLElement | null {
  if (!/^\/training(\/[a-zA-Z0-9_-]+)?\/?$/.test(path)) return null;
  if (/^\/training\/(dashboard|history|themes|replay)(\/|$)/i.test(path))
    return null;

  const candidates = [
    ...doc.querySelectorAll<HTMLElement>(
      "main.puzzle, .puzzle.puzzle-play, [data-lichess-puzzle-root]",
    ),
  ].filter(visible);

  if (candidates.length > 0) return candidates[0];

  const main = doc.querySelector<HTMLElement>("main");
  if (
    main &&
    visible(main) &&
    main.querySelector(".puzzle__feedback, .puzzle__side, .puzzle__controls")
  ) {
    return main;
  }
  return null;
}

export function isLichessPuzzlePage(
  doc: Document = document,
  path = location.pathname,
): boolean {
  return !!lichessPuzzleRoot(doc, path);
}

function isCandidatePuzzleId(id: string | null | undefined): id is string {
  if (!id) return false;
  const clean = id.trim();
  if (!/^[a-zA-Z0-9]{2,12}$/.test(clean)) return false;
  return !LICHESS_PUZZLE_THEMES.has(clean.toLowerCase());
}

function extractPuzzleId(root: HTMLElement, path: string): string | null {
  const attrNode = root.matches("[data-puzzle-id]")
    ? root
    : [...root.querySelectorAll("[data-puzzle-id]")].find(visible);
  const attrId = attrNode?.getAttribute("data-puzzle-id");
  if (isCandidatePuzzleId(attrId)) return attrId;

  const metaSelectors = [
    '.puzzle__side__metas a[href*="/training/"]',
    '.puzzle__side__infos a[href*="/training/"]',
    '.puzzle__side a[href*="/training/"]',
    'a[href*="/training/"]',
  ];
  for (const selector of metaSelectors) {
    for (const link of root.querySelectorAll<HTMLAnchorElement>(selector)) {
      if (!visible(link)) continue;
      const hashText = link.textContent?.trim().match(/^#([a-zA-Z0-9]{2,12})$/);
      if (hashText && isCandidatePuzzleId(hashText[1])) return hashText[1];
      const hrefMatch = link
        .getAttribute("href")
        ?.match(/\/training\/([a-zA-Z0-9]{2,12})\/?$/);
      if (hrefMatch && isCandidatePuzzleId(hrefMatch[1])) return hrefMatch[1];
    }
  }

  const metaContainers = [
    ...root.querySelectorAll<HTMLElement>(
      ".puzzle__side__metas, .puzzle__side__infos, .puzzle__side",
    ),
  ].filter(visible);
  for (const container of metaContainers) {
    const match = container.textContent?.match(
      /\bPuzzle\s+#([a-zA-Z0-9]{2,12})\b/i,
    );
    if (match && isCandidatePuzzleId(match[1])) return match[1];
  }

  const pathMatch = path.match(/^\/training\/([a-zA-Z0-9]{2,12})\/?$/);
  if (pathMatch && isCandidatePuzzleId(pathMatch[1])) return pathMatch[1];

  return null;
}

function parseRatingChange(root: HTMLElement): number | null {
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(
      "[data-rating-change], .puzzle__side__user__rating .rp, .puzzle__side__user .rp, .rp.up, .rp.down",
    ),
  ].filter(visible);

  for (const node of nodes) {
    const raw = (node.getAttribute("data-value") ?? node.textContent ?? "")
      .trim()
      .replace(/,/g, "")
      .replace("−", "-");
    if (/^[+-]?\d+$/.test(raw)) {
      const val = Number(raw);
      if (node.classList.contains("down") && val > 0 && !raw.startsWith("+")) {
        return -val;
      }
      return val;
    }
  }
  return null;
}

function parsePlayerRating(root: HTMLElement): number | null {
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(
      "[data-player-rating], .puzzle__side__user__rating strong, .puzzle__side__user strong",
    ),
  ].filter(visible);

  for (const node of nodes) {
    const raw = (node.getAttribute("data-value") ?? node.textContent ?? "")
      .trim()
      .replace(/,/g, "");
    if (/^\d{3,4}$/.test(raw)) {
      return Number(raw);
    }
  }
  return null;
}

function parsePuzzleRating(root: HTMLElement): number | null {
  const explicit = [
    ...root.querySelectorAll<HTMLElement>(
      "[data-puzzle-rating], .puzzle__side__metas .rating strong, .puzzle__side__infos .rating strong",
    ),
  ].find(visible);
  if (explicit) {
    const raw = (
      explicit.getAttribute("data-value") ??
      explicit.textContent ??
      ""
    )
      .trim()
      .replace(/,/g, "");
    if (/^\d{3,4}$/.test(raw)) return Number(raw);
  }

  const metas = [
    ...root.querySelectorAll<HTMLElement>(
      ".puzzle__side__metas, .puzzle__side__infos",
    ),
  ].filter(visible);
  for (const meta of metas) {
    const match = meta.textContent?.match(/Rating:\s*(\d{3,4})\b/i);
    if (match) return Number(match[1]);
  }
  return null;
}

export function readLichessPuzzleObservation(
  root: HTMLElement,
  path = location.pathname,
): PuzzleObservation {
  const puzzleId = extractPuzzleId(root, path);
  const ratingChange = parseRatingChange(root);

  const explicitNode = [
    root,
    ...root.querySelectorAll<HTMLElement>(
      "[data-puzzle-result],[data-puzzle-state]",
    ),
  ].find(
    (e) =>
      visible(e) &&
      /^(solved|failed|complete|completed|success|failure)$/i.test(
        e.getAttribute("data-puzzle-result") ??
          e.getAttribute("data-puzzle-state") ??
          "",
      ),
  );
  const explicit = (
    explicitNode?.getAttribute("data-puzzle-result") ??
    explicitNode?.getAttribute("data-puzzle-state")
  )?.toLowerCase();

  let result: PuzzleObservation["result"] = null;

  if (explicit) {
    result = /solved|success|complete/.test(explicit)
      ? "solved"
      : /failed|failure/.test(explicit)
        ? "failed"
        : "unknown";
  } else {
    const feedback = [
      ...root.querySelectorAll<HTMLElement>(".puzzle__feedback"),
    ].find(visible);
    const viewSolutionBtn = [
      ...root.querySelectorAll<HTMLElement>(
        ".puzzle__feedback .view_solution, button.view_solution, a.view_solution",
      ),
    ].find(visible);
    const continueBtn = [
      ...root.querySelectorAll<HTMLElement>(
        ".puzzle__feedback .continue, a.continue, button.continue",
      ),
    ].find(visible);
    const completeNode = [
      ...root.querySelectorAll<HTMLElement>(
        ".puzzle__feedback .complete, .puzzle__feedback .win",
      ),
    ].find(visible);
    const failNode = [
      ...root.querySelectorAll<HTMLElement>(
        ".puzzle__feedback.fail, .puzzle__feedback .fail, .puzzle__feedback .loss, .puzzle__feedback .bad",
      ),
    ].find(visible);

    const feedbackText = feedback?.textContent?.trim() ?? "";
    const isAfter =
      !!feedback?.classList.contains("after") ||
      !!continueBtn ||
      !!completeNode;
    const isFailClass =
      !!feedback?.classList.contains("fail") ||
      !!failNode ||
      !!viewSolutionBtn;

    if (isFailClass) {
      result = "failed";
    } else if (isAfter) {
      if (
        (ratingChange !== null && ratingChange < 0) ||
        /\b(puzzle failed|failed|not the move|incorrect)\b/i.test(feedbackText)
      ) {
        result = "failed";
      } else {
        result = "solved";
      }
    }
  }

  return {
    puzzleId,
    result,
    ratingChange,
    ratingAfter: result ? parsePlayerRating(root) : null,
    puzzleRating: result ? parsePuzzleRating(root) : null,
  };
}

export function installLichessPuzzleTracker() {
  let root: HTMLElement | null = null,
    observer: MutationObserver | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  let username = "",
    enabled = true,
    lastSavedAttempt: PuzzleAttempt | null = null,
    generation = 0,
    initialized = "";
  let settings: Settings | null = null,
    retries = 0;
  let snapshot: PuzzleSnapshot = { attempts: [], tracking: null };
  const storageKey = "chessHeatmap.lichessPuzzleSession";
  let restored: ConstructorParameters<typeof PuzzleTrackerMachine>[2] = null;
  try {
    restored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  } catch {
    /* unavailable tab storage */
  }

  const machine = new PuzzleTrackerMachine(
    async (a) => {
      const gen = generation;
      const saved = await send<boolean>({ type: "ci:puzzle-save", attempt: a });
      if (saved && a.username === username && gen === generation) {
        lastSavedAttempt = a;
      }
      const next = await send<PuzzleSnapshot>({
        type: "ci:puzzles",
        username: a.username,
      });
      if (a.username === username && gen === generation) snapshot = next;
    },
    (s) => {
      try {
        if (s) sessionStorage.setItem(storageKey, JSON.stringify(s));
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* Repository dedup remains authoritative. */
      }
    },
    restored,
    "lichess",
  );

  const resolveActiveUser = () =>
    detectLichessUsername() ?? settings?.lichessUsername?.toLowerCase() ?? null;

  const scan = () => {
    const activeUser = resolveActiveUser();
    if (
      !root ||
      !enabled ||
      !username ||
      activeUser !== username ||
      !isLichessPuzzlePage()
    )
      return;
    void machine
      .observe(username, readLichessPuzzleObservation(root))
      .then(() => {
        retries = 0;
      })
      .catch(() => {
        if (retries < 3) {
          retries++;
          timer = setTimeout(() => {
            timer = undefined;
            scan();
          }, retries * 1000);
        }
      });
  };

  const schedule = () => {
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined;
        scan();
      }, 80);
  };

  const update = async () => {
    const gen = ++generation;
    if (!settings) {
      const loaded = await send<Settings>({ type: "ci:settings" });
      settings ??= loaded;
    }
    if (gen !== generation) return;
    const detected = resolveActiveUser();
    const nextEnabled = settings.trackPuzzleActivity !== false;
    if (enabled && !nextEnabled) {
      machine.reset();
      initialized = "";
    }
    enabled = nextEnabled;
    if (detected !== username) {
      if (machine.session?.username !== detected) machine.reset();
      username = detected ?? "";
      snapshot = { attempts: [], tracking: null };
    }
    if (username && enabled && initialized !== username) {
      const tracking = await send<PuzzleSnapshot["tracking"]>({
        type: "ci:puzzle-start",
        username,
      });
      if (gen !== generation) return;
      snapshot = { ...snapshot, tracking };
      initialized = username;
    }
    const next = enabled && username ? lichessPuzzleRoot() : null;
    if (next !== root) {
      observer?.disconnect();
      root = next;
      if (root) {
        observer = new MutationObserver(schedule);
        observer.observe(root, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            "data-puzzle-id",
            "data-puzzle-state",
            "data-puzzle-result",
            "data-rating-change",
            "data-value",
            "hidden",
            "aria-hidden",
            "class",
            "style",
            "disabled",
            "aria-disabled",
            "href",
          ],
        });
      }
    }
    if (root) scan();
  };

  const domUpdate = () => {
    void update().catch(() => undefined);
  };

  window.addEventListener("ci:dom-update", domUpdate);
  const click = (e: Event) => {
    const target =
      e.target instanceof Element
        ? e.target.closest('button,a,a[role="button"]')
        : null;
    if (!target || !root?.contains(target)) return;
    const label = (
      target.getAttribute("aria-label") ??
      target.getAttribute("title") ??
      target.textContent ??
      ""
    ).trim();
    if (
      target.classList.contains("continue") ||
      /^(continue training|next puzzle|next|continue)$/i.test(label)
    ) {
      machine.nextPuzzle();
    }
  };
  document.addEventListener("click", click, true);

  const changes = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes[SETTINGS_KEY]) {
      settings = (changes[SETTINGS_KEY].newValue as Settings) ?? null;
      void update().catch(() => undefined);
    }
    if (changes[PUZZLE_CHANGE_KEY] || changes[LICHESS_CHANGE_KEY]) {
      const account = username;
      const gen = generation;
      if (!account) return;
      void send<PuzzleSnapshot>({ type: "ci:puzzles", username: account })
        .then((s) => {
          if (account !== username || gen !== generation) return;
          if (
            snapshot.tracking &&
            s.tracking?.puzzleTrackingStartedAt !==
              snapshot.tracking.puzzleTrackingStartedAt
          )
            machine.reset();
          snapshot = s;
          if (enabled) scan();
        })
        .catch(() => undefined);
    }
  };

  chrome.storage.onChanged.addListener(changes);
  void update().catch(() => undefined);

  return {
    dispose: () => {
      generation++;
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      window.removeEventListener("ci:dom-update", domUpdate);
      document.removeEventListener("click", click, true);
      chrome.storage.onChanged.removeListener(changes);
    },
    getPuzzleTrackingStatus: async () => {
      if (username)
        snapshot = await send<PuzzleSnapshot>({ type: "ci:puzzles", username });
      const lichessAttempts = snapshot.attempts.filter(
        (a) => a.platform === "lichess",
      );
      return {
        username,
        enabled,
        isPuzzlePage: isLichessPuzzlePage(),
        currentPuzzleId: machine.session?.puzzleId ?? null,
        trackerState: machine.state,
        trackingStartDate:
          snapshot.tracking?.puzzleTrackingStartedLocalDate ?? null,
        totalAttempts: lichessAttempts.length,
        todayAttempts: lichessAttempts.filter(
          (a) => a.localDate === localDate(new Date()),
        ).length,
        todayResults: puzzleResults(
          lichessAttempts.filter(
            (a) => a.localDate === localDate(new Date()),
          ),
        ),
        lastSavedAttempt: lastSavedAttempt ?? machine.session?.attempt ?? null,
      };
    },
  };
}
