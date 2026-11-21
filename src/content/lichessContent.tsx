import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useEffect, useState } from "react";
import { useData } from "../features/state/useData";
import { HomepageHeatmap } from "../features/heatmap/HomepageHeatmap";
import {
  detectLichessUsername,
  detectProfileUsername,
  detectLichessTheme,
  lichessTarget,
} from "./dom/lichessDom";
import { integrateLichess } from "./dom/lichessIntegration";
import "../styles/theme.css";
import { observePage } from "./dom/pageObserver";
import { installLichessPuzzleTracker } from "./puzzles/lichessTracker";
import { WidgetBoundary } from "../features/components/WidgetBoundary";

// Request a throttled refresh whenever a Lichess page is opened.
void chrome.runtime
  .sendMessage({ type: "ci:lichess-sync" })
  .catch(() => undefined);

const puzzleTracker = installLichessPuzzleTracker();
const roots = new Map<HTMLElement, Root>();

function syncLichessTheme(element: HTMLElement) {
  element.classList.add("ci-host-lichess");
  const theme = detectLichessTheme();
  element.classList.toggle("ci-theme-dark", theme === "dark");
  element.classList.toggle(
    "ci-theme-transp",
    document.body?.classList.contains("transp") ?? false,
  );
}

function Surface({ element }: { element: HTMLElement }) {
  const state = useData("lichess");
  const [loggedIn, setLoggedIn] = useState(() => detectLichessUsername());
  const [profileUser, setProfileUser] = useState(() => detectProfileUsername());

  useEffect(() => {
    syncLichessTheme(element);
    const update = () => {
      syncLichessTheme(element);
      setLoggedIn(detectLichessUsername());
      setProfileUser(detectProfileUsername());
    };
    window.addEventListener("ci:dom-update", update);
    return () => window.removeEventListener("ci:dom-update", update);
  }, [element]);

  useEffect(() => {
    if (state.settingsLoaded && loggedIn && !state.username && !state.error) {
      void state.connect(loggedIn);
    }
  }, [
    loggedIn,
    state.username,
    state.settingsLoaded,
    state.error,
    state.connect,
  ]);

  const detected = loggedIn ?? profileUser;

  return (
    <WidgetBoundary key={`lichess:${state.username}:${state.data.version}`}>
      <HomepageHeatmap
        state={state}
        detected={detected}
        hostPlatform="lichess"
      />
    </WidgetBoundary>
  );
}

const mount = (element: HTMLElement) => {
  syncLichessTheme(element);
  const root = createRoot(element);
  roots.set(element, root);
  root.render(<Surface element={element} />);
};

const integration = integrateLichess({
  home: (root) => mount(root),
  unmount: (element) => {
    roots.get(element)?.unmount();
    roots.delete(element);
  },
});

observePage(() => {
  integration.update();
  roots.forEach((_root, element) => syncLichessTheme(element));
  window.dispatchEvent(new Event("ci:dom-update"));
});

integration.update();

if (import.meta.env.DEV) {
  Object.assign(window, {
    __CHESS_HEATMAP_DEBUG__: {
      getPuzzleTrackingStatus: puzzleTracker.getPuzzleTrackingStatus,
      refreshActivityFromLocalData: () =>
        window.dispatchEvent(new Event("ci:refresh-local-activity")),
      findHomepageTargets: lichessTarget,
      getMountStatus: integration.getMountStatus,
      remountHeatmap: integration.remountHeatmap,
    },
  });
}
