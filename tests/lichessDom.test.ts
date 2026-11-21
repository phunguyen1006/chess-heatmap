// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi, describe } from "vitest";
import { integrateLichess } from "../src/content/dom/lichessIntegration";
import {
  lichessTarget,
  detectLichessUsername,
  detectProfileUsername,
  detectLichessTheme,
  IDS,
} from "../src/content/dom/lichessDom";

const lobbyFixture = () => `
  <header id="top">
    <div class="dasher">
      <a id="user_tag" class="toggle link" href="/@/alice">alice</a>
    </div>
  </header>
  <div id="main-wrap">
    <main class="lobby">
      <div class="lobby__side"><a href="/@/streamer">Streamer</a></div>
      <div class="lobby__app"><div class="lpools"><button id="pool-3-0">3+0</button></div></div>
      <div class="lobby__table">
        <div class="lobby__start">
          <a href="/setup/hook" class="button">Create a game</a>
        </div>
      </div>
      <div class="lobby__tv"><div class="cg-wrap"></div></div>
      <div class="lobby__box lobby__puzzle">Daily Puzzle</div>
      <div class="lobby__box lobby__tournaments">Tournaments</div>
    </main>
  </div>
`;

const profileFixture = (username = "alice") => `
  <header id="top">
    <a id="user_tag" class="toggle link">${username}</a>
  </header>
  <div id="main-wrap">
    <main class="page-menu__content user-show box">
      <div class="box__top user-show__header"><h1>${username}</h1></div>
      <div class="user-show__social">Bio</div>
      <div class="angle-content">
        <div class="user-infos">Ratings overview</div>
        <div class="activity">Recent activity</div>
        <div id="games" class="user-show__games">Games list</div>
      </div>
    </main>
  </div>
`;

describe("Lichess DOM integration (Lobby & Profile)", () => {
  let mounted: ReturnType<typeof integrateLichess>;

  beforeEach(() => {
    document.body.className = "dark";
    document.body.innerHTML = lobbyFixture();
    history.replaceState(null, "", "/");
    mounted = integrateLichess({
      home: (r) => {
        r.innerHTML = '<div class="ci-scope">Lichess Heatmap</div>';
      },
      unmount: vi.fn(),
    });
  });

  afterEach(() => {
    mounted.dispose();
    document.body.removeAttribute("data-user");
    document.body.className = "";
  });

  it("mounts once on Lichess lobby (/) below the play blocks and before lower boxes when .lobby__feed is absent", () => {
    mounted.update();
    mounted.update();
    const root = document.getElementById(IDS.home)!;
    expect(root).not.toBeNull();
    expect(root.dataset.mountStrategy).toBe("lichess-lobby");
    expect(root.parentElement?.classList.contains("lobby")).toBe(true);
    expect(
      root.previousElementSibling?.classList.contains("lobby__table"),
    ).toBe(true);
    expect(root.nextElementSibling?.classList.contains("lobby__tv")).toBe(
      true,
    );
    expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
  });

  it("injects a full-width ci_heatmap row into CSS Grid grid-template-areas on Lichess lobby and restores on dispose", () => {
    const main = document.querySelector<HTMLElement>("main.lobby")!;
    main.style.gridTemplateAreas =
      '"side app table" "tv app table" "puzzle tournaments blog"';
    main.style.gridTemplateRows = "240px 200px auto";
    const originalAreas = main.style.gridTemplateAreas;
    const originalRows = main.style.gridTemplateRows;

    mounted.update();
    const root = document.getElementById(IDS.home)!;
    expect(root.style.gridArea).toBe("ci_heatmap");
    expect(main.style.gridTemplateAreas).toBe(
      '"side app table" "tv app table" "ci_heatmap ci_heatmap ci_heatmap" "puzzle tournaments blog"',
    );
    expect(main.style.gridTemplateRows).toBe("240px 200px auto auto");

    mounted.dispose();
    expect(main.style.gridTemplateAreas).toBe(originalAreas);
    expect(main.style.gridTemplateRows).toBe(originalRows);
  });

  it("mounts on the user's own Lichess profile (/@/alice) before the activity feed", () => {
    document.body.innerHTML = profileFixture("alice");
    history.replaceState(null, "", "/@/alice");

    mounted.update();
    mounted.update();
    const root = document.getElementById(IDS.home)!;
    expect(root).not.toBeNull();
    expect(root.dataset.mountStrategy).toBe("lichess-profile");
    expect(root.parentElement?.classList.contains("angle-content")).toBe(true);
    expect(root.previousElementSibling?.classList.contains("user-infos")).toBe(
      true,
    );
    expect(root.nextElementSibling?.classList.contains("activity")).toBe(true);
    expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
  });

  it("does not mount the user's personal heatmap on another player's Lichess profile when logged in", () => {
    document.body.innerHTML = profileFixture("alice");
    history.replaceState(null, "", "/@/magnuscarlsen");

    mounted.update();
    expect(document.getElementById(IDS.home)).toBeNull();
  });

  it("mounts on a Lichess profile page when browsing logged out", () => {
    document.body.innerHTML = profileFixture("alice");
    document.getElementById("user_tag")?.remove();
    history.replaceState(null, "", "/@/alice");

    mounted.update();
    expect(document.getElementById(IDS.home)).not.toBeNull();
    expect(detectProfileUsername()).toBe("alice");
  });

  it.each([
    "/abcd1234",
    "/training",
    "/training/000a9",
    "/analysis",
    "/study",
    "/tv",
    "/@/alice/all",
    "/@/alice/tv",
    "/tournament/123",
  ])("never mounts on non-home/non-profile route %s", (path) => {
    history.replaceState(null, "", path);
    mounted.update();
    expect(document.getElementById(IDS.home)).toBeNull();
  });

  it("unmounts immediately if a live game round replaces the lobby view", () => {
    mounted.update();
    expect(document.getElementById(IDS.home)).not.toBeNull();

    document.querySelector("main")!.className = "round";
    mounted.update();
    expect(document.getElementById(IDS.home)).toBeNull();
  });

  it("detects Lichess username from data-user, #user_tag text/href, and ignores links inside main", () => {
    expect(detectLichessUsername()).toBe("alice");

    const userTag = document.getElementById("user_tag")!;
    userTag.removeAttribute("href");
    userTag.textContent = "Bob_99";
    expect(detectLichessUsername()).toBe("bob_99");

    userTag.remove();
    expect(detectLichessUsername()).toBeNull();

    document.body.setAttribute("data-user", "Charlie-Chess");
    expect(detectLichessUsername()).toBe("charlie-chess");
  });

  it("detects Lichess light, dark, and transparent themes accurately", () => {
    document.body.className = "dark";
    expect(detectLichessTheme()).toBe("dark");

    document.body.className = "transp";
    expect(detectLichessTheme()).toBe("dark");

    document.body.className = "light";
    expect(detectLichessTheme()).toBe("light");
  });

  it("waits for lobby play controls before mounting on /", () => {
    document.body.innerHTML = '<main class="lobby"><div class="lobby__box">News</div></main>';
    expect(lichessTarget()).toBeNull();
    mounted.update();
    expect(document.getElementById(IDS.home)).toBeNull();
  });

  it("mounts in the center column (lichess-lobby-center) between Donate and Swag Store, wrapping both .lobby__feed ('13 hours ago') and .lobby__blog ('Performance' cards) so they stack cleanly without overlapping", () => {
    document.body.innerHTML = `
      <main class="lobby">
        <div class="lobby__timeline" style="grid-area: timeline">Personal timeline</div>
        <div class="lobby__side">Side</div>
        <div class="lobby__app">Quick Pairing</div>
        <div class="lobby__table">Create Game</div>
        <div class="lobby__counters">45,932 players</div>
        <div class="lobby__support">Donate</div>
        <div class="lobby__feed" style="grid-area: feed">13 hours ago</div>
        <div class="lobby__blog" style="grid-area: blog">Performance blog cards</div>
        <div class="lobby__store">Swag Store</div>
        <div class="lobby__tv">GM necp 2881</div>
        <div class="lobby__puzzle">Puzzle of the day</div>
      </main>
    `;
    const main = document.querySelector<HTMLElement>("main.lobby")!;
    main.style.gridTemplateAreas = [
      '"timeline app table"',
      '"timeline app counters"',
      '"support feed store"',
      '"tv feed puzzle"',
      '"tv blog puzzle"',
      '"about blog ."',
    ].join(" ");
    const timeline = main.querySelector<HTMLElement>(".lobby__timeline")!;
    const feed = main.querySelector<HTMLElement>(".lobby__feed")!;
    const blog = main.querySelector<HTMLElement>(".lobby__blog")!;
    timeline.style.cssText = timeline.style.cssText;
    feed.style.cssText = feed.style.cssText;
    blog.style.cssText = blog.style.cssText;
    const originalHTML = main.innerHTML;
    const originalAreas = main.style.gridTemplateAreas;

    mounted.update();
    mounted.update();

    const root = document.getElementById(IDS.home)!;
    const centerCol = main.querySelector<HTMLElement>(
      ".ci-lichess-center-column",
    )!;
    expect(root).not.toBeNull();
    expect(centerCol).not.toBeNull();
    expect(root.dataset.mountStrategy).toBe("lichess-lobby-center");
    expect(mounted.getMountStatus().centerColumnWrapped).toBe(true);
    expect(mounted.getMountStatus().wrappedCount).toBe(2);
    expect(centerCol.parentElement).toBe(main);
    expect(centerCol.style.gridArea).toBe("feed");
    expect([...centerCol.children]).toEqual([root, feed, blog]);
    expect(timeline.parentElement).toBe(main);
    expect(main.style.gridTemplateAreas).toBe(
      [
        '"timeline app table"',
        '"timeline app counters"',
        '"support feed store"',
        '"tv feed puzzle"',
        '"tv feed puzzle"',
        '"about feed ."',
      ].join(" "),
    );

    mounted.dispose();
    expect(main.querySelector(".ci-lichess-center-column")).toBeNull();
    expect(feed.parentElement).toBe(main);
    expect(blog.parentElement).toBe(main);
    expect(main.style.gridTemplateAreas).toBe(originalAreas);
    expect(main.innerHTML).toBe(originalHTML);
  });

  it("handles fallback lobby layouts without .lobby__feed using buildLobbyGridAreas", () => {
    document.body.innerHTML = `
      <main class="lobby">
        <div class="lobby__side">Side</div>
        <div class="lobby__app">Quick Pairing</div>
        <div class="lobby__table">Create Game</div>
        <div class="lobby__counters">123,050 players</div>
        <div class="lobby__support">Donate</div>
        <div class="lobby__store">Swag Store</div>
      </main>
    `;
    const main = document.querySelector<HTMLElement>("main.lobby")!;
    main.style.gridTemplateAreas = [
      '"side app table"',
      '"tv app counters"',
      '"support store store"',
    ].join(" ");

    mounted.update();
    const root = document.getElementById(IDS.home)!;
    expect(root.style.gridArea).toBe("ci_heatmap");
    expect(main.style.gridTemplateAreas).toBe(
      [
        '"side app table"',
        '"tv app counters"',
        '"ci_heatmap ci_heatmap ci_heatmap"',
        '"support store store"',
      ].join(" "),
    );
  });
});
