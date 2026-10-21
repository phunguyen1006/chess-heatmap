import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useEffect, useState } from "react";
import { useData } from "../features/state/useData";
import { HomepageHeatmap } from "../features/heatmap/HomepageHeatmap";
import { detectUsername, homepageTarget } from "./dom/chessDom";
import { integrate } from "./dom/integration";
import "../styles/theme.css";
import { observePage } from "./dom/pageObserver";
import { installPuzzleTracker } from "./puzzles/tracker";
import { useAppearance } from "../features/state/useAppearance";
import { WidgetBoundary } from "../features/components/WidgetBoundary";

const puzzleTracker = installPuzzleTracker();
const roots = new Map<HTMLElement, Root>();

function syncTheme(element: HTMLElement) {
  if (element.id === "chess-insights-home-heatmap") {
    const buttons = document.querySelectorAll<HTMLElement>(
      'main a[href*="/play/online"],main button,[class*="home-play"] a',
    );
    for (const button of buttons) {
      if (button.closest(".ci-scope")) continue;
      const color = getComputedStyle(button).backgroundColor,
        channels = color.match(/\d+/g)?.map(Number);
      if (
        channels &&
        channels[1] > channels[0] * 1.1 &&
        channels[1] > channels[2] * 1.3 &&
        channels[1] > 80
      ) {
        element.style.setProperty("--ci-native-green", color);
        break;
      }
    }
  }
}

function Surface({ element }: { element: HTMLElement }) {
  const appearance = useAppearance();

  useEffect(() => {
    element.classList.toggle("ci-theme-dark", appearance.theme === "dark");
  }, [appearance.theme, element]);

  const state = useData(),
    [detected, setDetected] = useState(detectUsername());

  useEffect(() => {
    const update = () => setDetected(detectUsername());
    window.addEventListener("ci:dom-update", update);
    return () => window.removeEventListener("ci:dom-update", update);
  }, []);

  useEffect(() => {
    if (state.settingsLoaded && detected && !state.username && !state.error)
      void state.connect(detected);
  }, [
    detected,
    state.username,
    state.settingsLoaded,
    state.error,
    state.connect,
  ]);

  return (
    <WidgetBoundary key={`${state.username}:${state.data.version}`}>
      <HomepageHeatmap state={state} detected={detected} />
    </WidgetBoundary>
  );
}

const mount = (element: HTMLElement) => {
  syncTheme(element);
  const root = createRoot(element);
  roots.set(element, root);
  root.render(<Surface element={element} />);
};

const integration = integrate({
  home: (root) => mount(root),
  unmount: (element) => {
    roots.get(element)?.unmount();
    roots.delete(element);
  },
});

observePage(() => {
  integration.update();
  roots.forEach((_root, element) => syncTheme(element));
  window.dispatchEvent(new Event("ci:dom-update"));
});

integration.update();

if (import.meta.env.DEV) {
  Object.assign(window, {
    __CHESS_HEATMAP_DEBUG__: {
      getPuzzleTrackingStatus: puzzleTracker.getPuzzleTrackingStatus,
      refreshActivityFromLocalData: () =>
        window.dispatchEvent(new Event("ci:refresh-local-activity")),
      findHomepageTargets: homepageTarget,
      getMountStatus: integration.getMountStatus,
      remountHeatmap: integration.remountHeatmap,
      getHeatmapGeometry: integration.getHeatmapGeometry,
    },
  });
}
