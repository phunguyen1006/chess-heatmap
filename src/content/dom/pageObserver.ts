import { IDS } from "./chessDom";

const ownSurfaces = `.ci-scope,#${IDS.home}`;

export function observePage(update: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      update();
    }, 180);
  };

  const observer = new MutationObserver((records) => {
    if (
      records.some((record) => {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;

        if (
          [...record.removedNodes].some(
            (node) =>
              node instanceof Element &&
              !node.isConnected &&
              (node.id === IDS.home || !!node.querySelector(`#${IDS.home}`)),
          )
        )
          return true;

        if (target?.closest(ownSurfaces)) return false;

        return (
          record.type === "attributes" ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element && !node.id.startsWith("chess-insights-"),
          )
        );
      })
    )
      schedule();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "class",
      "href",
      "role",
      "data-component",
      "data-testid",
      "aria-label",
      "aria-hidden",
      "hidden",
      "title",
      "data-game-status",
    ],
  });

  const onClick = (event: Event) => {
    if (
      event.target instanceof Element &&
      event.target.closest('a[href],nav button,[role="navigation"] button')
    )
      schedule();
  };

  for (const name of ["hashchange", "popstate", "pageshow", "resize"])
    window.addEventListener(name, schedule);
  document.addEventListener("click", onClick);

  return {
    schedule,
    dispose: () => {
      observer.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      for (const name of ["hashchange", "popstate", "pageshow", "resize"])
        window.removeEventListener(name, schedule);
      document.removeEventListener("click", onClick);
    },
  };
}
