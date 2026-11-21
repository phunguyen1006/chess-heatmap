import { useEffect, useState, useCallback, useRef } from "react";
import type { Snapshot, Settings, Platform } from "../../shared/types";
import { getEdition } from "../../shared/edition";
import { SETTINGS_KEY, LICHESS_CHANGE_KEY } from "../../shared/constants";
import { send } from "./client";

const initial: Snapshot = {
  games: [],
  years: [new Date().getFullYear()],
  lastSync: 0,
  version: 0,
};

export function useData(hostPlatform: Platform = "chesscom") {
  const [data, setData] = useState(initial),
    [username, setUsername] = useState(""),
    [settingsLoaded, setSettingsLoaded] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const account = useRef(""),
    chessAccount = useRef(""),
    lichessAccount = useRef(""),
    busy = useRef(false),
    generation = useRef(0),
    requested = useRef(new Set<number>()),
    forceRequested = useRef(false);

  const refresh = useCallback(
    async (years: number[], force = false) => {
      if (!account.current) return;
      years.forEach((y) => requested.current.add(y));
      forceRequested.current ||= force;
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      setError("");
      const user = account.current,
        chessUser = chessAccount.current,
        lichessUser = lichessAccount.current,
        gen = generation.current;
      try {
        while (requested.current.size && gen === generation.current) {
          const pending = [...requested.current],
            forced = forceRequested.current;
          requested.current.clear();
          forceRequested.current = false;

          if (
            lichessUser &&
            (hostPlatform === "lichess" || forced || !chessUser)
          ) {
            await send<boolean>({
              type: "ci:lichess-sync",
              force: forced,
              years: pending,
            });
            if (gen !== generation.current) break;
            if (!chessUser) {
              const next = await send<Snapshot>({
                type: "ci:snapshot",
                username: user,
              });
              if (gen === generation.current) setData(next);
            }
          }

          if (chessUser) {
            for (const year of pending) {
              if (gen !== generation.current) break;
              const next = await send<Snapshot>({
                type: "ci:sync",
                username: chessUser,
                years: [year],
                force: forced && year === pending[0],
              });
              if (gen === generation.current) setData(next);
            }
          }
        }
      } catch (e) {
        if (gen === generation.current) {
          try {
            const cached = await send<Snapshot>({
              type: "ci:snapshot",
              username: user,
            });
            if (gen === generation.current) setData(cached);
          } catch {
            /* Keep already displayed data if local storage is unavailable. */
          }
          if (gen === generation.current)
            setError(e instanceof Error ? e.message : "Unable to refresh.");
        }
      } finally {
        if (gen === generation.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [hostPlatform],
  );

  const activate = useCallback(
    async (user: string, chessUser?: string, lichessUser?: string) => {
      generation.current++;
      const gen = generation.current;
      account.current = user;
      if (chessUser !== undefined) chessAccount.current = chessUser;
      if (lichessUser !== undefined) lichessAccount.current = lichessUser;
      busy.current = false;
      requested.current.clear();
      forceRequested.current = false;
      setUsername(user);
      setData(initial);
      setError("");
      setLoading(true);
      try {
        const cached = await send<Snapshot>({
          type: "ci:snapshot",
          username: user,
        });
        if (gen !== generation.current) return;
        setData(cached);
        void refresh([new Date().getFullYear()]);
      } catch (e) {
        if (gen === generation.current) {
          setError(String(e));
          setLoading(false);
        }
      }
    },
    [refresh],
  );

  const connect = useCallback(
    async (user: string, token?: string) => {
      setError("");
      try {
        if (hostPlatform === "lichess") {
          const res = await send<{ username: string }>({
            type: "ci:lichess-connect",
            username: user.trim(),
            token: token?.trim() || undefined,
          });
          lichessAccount.current = res.username;
          if (account.current !== res.username) {
            await activate(
              res.username,
              chessAccount.current,
              res.username,
            );
          } else {
            await refresh([new Date().getFullYear()]);
          }
          return true;
        }
        const settings = await send<Settings>({
          type: "ci:connect",
          username: user.trim(),
        });
        chessAccount.current = settings.username ?? "";
        if (account.current !== settings.username)
          await activate(
            settings.username!,
            settings.username ?? "",
            lichessAccount.current,
          );
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [activate, hostPlatform, refresh],
  );

  useEffect(() => {
    let active = true;
    const edition = getEdition();
    const resolveChess = (s: Settings | undefined) =>
      edition === "lichess" ? "" : (s?.username ?? "");
    const resolveLichess = (s: Settings | undefined) =>
      edition === "chesscom" ? "" : (s?.lichessUsername ?? "");
    const resolvePrimary = (s: Settings | undefined) => {
      if (!s) return "";
      if (edition === "chesscom") return resolveChess(s);
      if (edition === "lichess") return resolveLichess(s);
      return hostPlatform === "lichess"
        ? (s.lichessUsername ?? "")
        : (s.username ?? s.lichessUsername ?? "");
    };
    void send<Settings>({ type: "ci:settings" })
      .then((s) => {
        if (!active) return;
        chessAccount.current = resolveChess(s);
        lichessAccount.current = resolveLichess(s);
        const primary = resolvePrimary(s);
        if (primary) {
          void activate(primary, resolveChess(s), resolveLichess(s));
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setSettingsLoaded(true);
      });
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      const next = changes[SETTINGS_KEY]?.newValue as Settings | undefined;
      if (next) {
        chessAccount.current = resolveChess(next);
        lichessAccount.current = resolveLichess(next);
        const primary = resolvePrimary(next);
        if (primary && primary !== account.current) {
          void activate(
            primary,
            resolveChess(next),
            resolveLichess(next),
          );
          return;
        }
        if (!primary && account.current) {
          account.current = "";
          setUsername("");
          setData(initial);
          return;
        }
      }
      if (edition !== "chesscom" && changes[LICHESS_CHANGE_KEY] && account.current) {
        const user = account.current,
          gen = generation.current;
        void send<Snapshot>({ type: "ci:snapshot", username: user })
          .then((cached) => {
            if (gen === generation.current) setData(cached);
          })
          .catch(() => undefined);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      generation.current++;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [activate, hostPlatform]);

  useEffect(() => {
    const listener = (message: { type?: string; username?: string }) => {
      if (
        message?.type === "ci:data-changed" &&
        (message.username === account.current ||
          message.username === chessAccount.current ||
          message.username === lichessAccount.current)
      ) {
        const user = account.current,
          gen = generation.current;
        if (!user) return;
        void send<Snapshot>({ type: "ci:snapshot", username: user })
          .then((next) => {
            if (gen === generation.current)
              setData((previous) =>
                previous.version >= next.version ? previous : next,
              );
          })
          .catch(() => undefined);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    const local = () => {
      const user = account.current,
        gen = generation.current;
      if (user)
        void send<Snapshot>({ type: "ci:snapshot", username: user })
          .then((next) => {
            if (gen === generation.current) setData(next);
          })
          .catch(() => undefined);
    };
    window.addEventListener("ci:refresh-local-activity", local);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      window.removeEventListener("ci:refresh-local-activity", local);
    };
  }, []);

  return { data, username, settingsLoaded, loading, error, refresh, connect };
}

export type DataState = ReturnType<typeof useData>;
