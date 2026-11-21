import { IDS } from "./chessDom";

export { IDS };

const own = (element: Element) =>
  !!element.closest(`.ci-scope, #${IDS.home}`);

export const TOP_LOBBY_SELECTORS = [
  ".lobby__app",
  ".hooks__wrap",
  ".lobby__table",
  ".lobby__start",
  ".lobby__counters",
  ".lobby__side",
  ".lobby__timeline",
  ".lobby__streams",
  ".lobby__spotlights",
];

export const LOWER_LOBBY_SELECTORS = [
  ".lobby__support",
  ".lobby__feed",
  ".lobby__tv",
  ".lobby__tournaments",
  ".lobby__simuls",
  ".lobby__forum",
  ".lobby__blog",
  ".lobby__puzzle",
  ".lobby__leaderboard",
  ".lobby__winners",
  ".lobby__about",
  ".lobby__store",
];

const VALID_USER = /^[a-zA-Z0-9_-]{2,30}$/;

function directChild(parent: Element, element: Element): HTMLElement | null {
  let child = element as HTMLElement;
  while (child.parentElement && child.parentElement !== parent)
    child = child.parentElement;
  return child.parentElement === parent ? child : null;
}

export function isLichessLobbyRoute(path = location.pathname): boolean {
  return path === "/";
}

export function isLichessProfileRoute(path = location.pathname): boolean {
  return /^\/@\/[a-zA-Z0-9_-]{2,30}\/?$/.test(path);
}

export function isLichessMountRoute(path = location.pathname): boolean {
  return isLichessLobbyRoute(path) || isLichessProfileRoute(path);
}

export function detectProfileUsername(
  path = location.pathname,
): string | null {
  const match = path.match(/^\/@\/([a-zA-Z0-9_-]{2,30})\/?$/);
  return match ? match[1].toLowerCase() : null;
}

export function detectLichessUsername(doc: Document = document): string | null {
  const bodyUser =
    doc.body?.getAttribute("data-user") ??
    doc.documentElement?.getAttribute("data-user");
  if (bodyUser && VALID_USER.test(bodyUser.trim())) {
    return bodyUser.trim().toLowerCase();
  }

  const userTag = doc.getElementById("user_tag");
  if (userTag && !own(userTag)) {
    if (userTag instanceof HTMLAnchorElement && userTag.href) {
      try {
        const match = new URL(userTag.href, location.href).pathname.match(
          /^\/@\/([a-zA-Z0-9_-]{2,30})\/?$/,
        );
        if (match) return match[1].toLowerCase();
      } catch {
        // Fallback to textContent
      }
    }
    const text = userTag.textContent?.trim() ?? "";
    if (VALID_USER.test(text)) {
      return text.toLowerCase();
    }
  }

  const selectors = [
    'header#top a[href^="/@/"]',
    '#top a.user-link[href^="/@/"]',
    '.dasher a[href^="/@/"]',
    'header a.user-link[href^="/@/"]',
    'nav a[href^="/@/"]',
  ];
  for (const selector of selectors) {
    for (const link of doc.querySelectorAll<HTMLAnchorElement>(selector)) {
      if (own(link) || link.closest("main")) continue;
      try {
        const match = new URL(link.href, location.href).pathname.match(
          /^\/@\/([a-zA-Z0-9_-]{2,30})\/?$/,
        );
        if (match) return match[1].toLowerCase();
      } catch {
        continue;
      }
    }
  }

  return null;
}

export function detectLichessTheme(
  doc: Document = document,
): "light" | "dark" {
  const elements = [doc.body, doc.documentElement].filter(
    (e): e is HTMLElement => !!e,
  );
  for (const el of elements) {
    const dataTheme = el.getAttribute("data-theme")?.toLowerCase();
    if (
      el.classList.contains("dark") ||
      el.classList.contains("transp") ||
      dataTheme === "dark" ||
      dataTheme === "transp"
    ) {
      return "dark";
    }
    if (el.classList.contains("light") || dataTheme === "light") {
      return "light";
    }
    if (el.classList.contains("system") || dataTheme === "system") {
      return typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: light)")?.matches
        ? "light"
        : "dark";
    }
  }

  if (doc.body && typeof getComputedStyle === "function") {
    const bg = getComputedStyle(doc.body).backgroundColor;
    const channels = bg.match(/\d+/g)?.map(Number);
    if (channels && channels.length >= 3) {
      const [r, g, b] = channels;
      if (r + g + b > 0 && (r + g + b) / 3 > 140) return "light";
      if (r + g + b > 0) return "dark";
    }
  }

  return "dark";
}

export function isForeignLichessProfile(
  doc: Document = document,
  path = location.pathname,
): boolean {
  if (!isLichessProfileRoute(path)) return false;
  const profileUser = detectProfileUsername(path);
  const loggedIn = detectLichessUsername(doc);
  return !!loggedIn && !!profileUser && loggedIn !== profileUser;
}

export function lichessLiveContext(
  doc: Document = document,
  path = location.pathname,
): boolean {
  if (!isLichessMountRoute(path) || isForeignLichessProfile(doc, path))
    return true;
  return !!doc.querySelector(
    'main.round, .round__app, main.puzzle, main.analysis, main.study, [data-game-status="in_progress"], [data-game-status="active"]',
  );
}

export function getLichessMain(doc: Document = document): HTMLElement | null {
  const candidates = [
    ...doc.querySelectorAll<HTMLElement>(
      [
        "main.lobby",
        "main.user-show",
        "main.page-menu__content.user-show",
        "main.profile",
        "#main-wrap main",
        "main",
        '[role="main"]',
        ".page-menu__content.user-show",
        ".user-profile",
      ].join(","),
    ),
  ].filter((e) => !own(e));

  return candidates[0] ?? null;
}

export interface LichessMountTarget {
  parent: HTMLElement;
  before: HTMLElement | null;
  strategy: "lichess-lobby-center" | "lichess-lobby" | "lichess-profile";
  row: HTMLElement;
  cards?: HTMLElement[];
  playArea?: HTMLElement;
  wrap?: boolean;
}

export function lichessTarget(
  main = getLichessMain(),
  path = location.pathname,
): LichessMountTarget | null {
  if (!main) return null;

  if (isLichessProfileRoute(path)) {
    const angleContent = main.querySelector<HTMLElement>(".angle-content");
    if (angleContent && !own(angleContent)) {
      const activity = angleContent.querySelector<HTMLElement>(
        ".activity, #games, .user-show__games",
      );
      const beforeActivity = activity
        ? directChild(angleContent, activity)
        : null;
      const userInfos = angleContent.querySelector<HTMLElement>(".user-infos");
      const directInfos = userInfos
        ? directChild(angleContent, userInfos)
        : null;
      const before =
        beforeActivity ??
        (directInfos
          ? (directInfos.nextElementSibling as HTMLElement | null)
          : (angleContent.firstElementChild as HTMLElement | null));
      return {
        parent: angleContent,
        before,
        row: directInfos ?? angleContent,
        cards: [directInfos ?? angleContent],
        strategy: "lichess-profile",
      };
    }

    const profileMain = main.querySelector<HTMLElement>(
      ".profile-main, .user-show__content",
    );
    if (profileMain && !own(profileMain)) {
      const activity = profileMain.querySelector<HTMLElement>(
        ".activity, #games, .user-show__games",
      );
      const before = activity
        ? directChild(profileMain, activity)
        : (profileMain.firstElementChild as HTMLElement | null);
      return {
        parent: profileMain,
        before,
        row: profileMain,
        cards: [profileMain],
        strategy: "lichess-profile",
      };
    }

    const header = main.querySelector<HTMLElement>(
      ".user-show__social, .user-show__header, .box__top, header.user-header, .profile-side",
    );
    const directHeader = header ? directChild(main, header) : null;
    if (directHeader) {
      return {
        parent: main,
        before: directHeader.nextElementSibling as HTMLElement | null,
        row: directHeader,
        cards: [directHeader],
        strategy: "lichess-profile",
      };
    }

    return null;
  }

  if (isLichessLobbyRoute(path)) {
    const app = main.querySelector<HTMLElement>(".lobby__app, .hooks__wrap");
    const table = main.querySelector<HTMLElement>(
      ".lobby__table, .lobby__start",
    );
    if (!app && !table) return null;

    const host =
      (app && table && app.parentElement === table.parentElement
        ? app.parentElement
        : null) ?? main;

    const appCard = app ? directChild(host, app) : null;
    const tableCard = table ? directChild(host, table) : null;
    const hostChildren = [...host.children].filter(
      (c): c is HTMLElement => c instanceof HTMLElement && !own(c),
    );

    // 1. Prefer mounting in the center column right above the news feed
    // ("12 hours ago" -> .lobby__feed), flanked by Donate on the left and Swag Store on the right.
    // Note: .lobby__timeline is the top-left personal sidebar in Row 1 Col 1, NOT the center feed!
    const isCenterBelowApp = (el: HTMLElement): boolean => {
      if (!appCard) return true;
      const appRect = appCard.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (appRect.width <= 0 || elRect.width <= 0) return true;
      return (
        Math.abs(elRect.left - appRect.left) < 60 &&
        elRect.top >= appRect.bottom - 20
      );
    };

    const explicitFeed = main.querySelector<HTMLElement>(
      '.lobby__feed, [class*="lobby__feed"]',
    );
    const candidateFeed =
      explicitFeed && !own(explicitFeed)
        ? directChild(host, explicitFeed)
        : null;
    let feedCard =
      candidateFeed && isCenterBelowApp(candidateFeed) ? candidateFeed : null;

    if (!feedCard) {
      feedCard =
        hostChildren.find((child) => {
          const cs = getComputedStyle(child);
          const area = (
            child.style.gridArea ||
            cs.gridArea ||
            cs.gridRowStart ||
            ""
          )
            .split("/")[0]
            ?.trim();
          return area === "feed" && isCenterBelowApp(child);
        }) ?? null;
    }

    if (!feedCard && appCard) {
      const appRect = appCard.getBoundingClientRect();
      if (appRect.width > 0 && appRect.height > 0) {
        let best: HTMLElement | null = null;
        let bestTop = Infinity;
        for (const child of hostChildren) {
          if (
            child === appCard ||
            child === tableCard ||
            child.matches(TOP_LOBBY_SELECTORS.join(","))
          )
            continue;
          const r = child.getBoundingClientRect();
          if (
            r.width > 0 &&
            r.height > 0 &&
            Math.abs(r.left - appRect.left) < 60 &&
            r.top >= appRect.bottom - 20 &&
            r.top < bestTop
          ) {
            best = child;
            bestTop = r.top;
          }
        }
        feedCard = best;
      }
    }

    if (feedCard) {
      const centerCards: HTMLElement[] = [feedCard];
      const addCenterCard = (el: HTMLElement | null) => {
        if (el && !own(el) && !centerCards.includes(el)) {
          centerCards.push(el);
        }
      };

      // Also include .lobby__blog (the 3 blog thumbnail cards directly below .lobby__feed
      // in the center column) so pushing .lobby__feed down also pushes .lobby__blog down
      // cleanly without overlapping.
      for (const el of main.querySelectorAll<HTMLElement>(
        '.lobby__blog, [class*="lobby__blog"]',
      )) {
        const direct = directChild(host, el);
        if (direct && isCenterBelowApp(direct)) addCenterCard(direct);
      }

      for (const child of hostChildren) {
        if (centerCards.includes(child)) continue;
        const cs = getComputedStyle(child);
        const area = (
          child.style.gridArea ||
          cs.gridArea ||
          cs.gridRowStart ||
          ""
        )
          .split("/")[0]
          ?.trim();
        if (area === "blog" && isCenterBelowApp(child)) {
          addCenterCard(child);
        }
      }

      const feedRect = feedCard.getBoundingClientRect();
      if (feedRect.width > 0 && feedRect.height > 0) {
        const belowInCenter = hostChildren
          .filter((child) => {
            if (
              centerCards.includes(child) ||
              child === appCard ||
              child === tableCard ||
              child.matches(TOP_LOBBY_SELECTORS.join(","))
            )
              return false;
            const r = child.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.height > 0 &&
              Math.abs(r.left - feedRect.left) < 60 &&
              r.top >= feedRect.top - 10
            );
          })
          .sort(
            (a, b) =>
              a.getBoundingClientRect().top - b.getBoundingClientRect().top,
          );
        for (const c of belowInCenter) addCenterCard(c);
      }

      return {
        parent: host,
        before: feedCard,
        row: feedCard,
        cards: centerCards,
        playArea: appCard ?? tableCard ?? feedCard,
        wrap: true,
        strategy: "lichess-lobby-center",
      };
    }

    const topAnchors = [
      app,
      table,
      ...main.querySelectorAll<HTMLElement>(TOP_LOBBY_SELECTORS.join(",")),
    ]
      .filter((el): el is HTMLElement => !!el && !own(el))
      .map((el) => directChild(host, el))
      .filter((el): el is HTMLElement => !!el);

    const uniqueTop = [...new Set(topAnchors)];
    if (uniqueTop.length === 0) return null;

    let lastTopIndex = -1;
    for (const top of uniqueTop) {
      const idx = hostChildren.indexOf(top);
      if (idx > lastTopIndex) lastTopIndex = idx;
    }

    const before =
      lastTopIndex >= 0 && lastTopIndex + 1 < hostChildren.length
        ? hostChildren[lastTopIndex + 1]
        : null;
    const playArea = appCard ?? tableCard ?? uniqueTop[0];

    return {
      parent: host,
      before,
      row: playArea,
      cards: uniqueTop,
      playArea,
      strategy: "lichess-lobby",
    };
  }

  return null;
}
