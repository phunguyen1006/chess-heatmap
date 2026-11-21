import { useEffect, useState } from "react";
import type { Settings } from "../shared/types";
import { getEdition } from "../shared/edition";
import type { Edition } from "../shared/edition";
import { version } from "../../package.json";

function sendRuntime<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (res && typeof res === "object" && "ok" in res) {
        if (res.ok) {
          resolve("data" in res ? res.data : undefined as unknown as T);
        } else {
          reject(new Error(res.error?.message ?? "Operation failed"));
        }
        return;
      }
      resolve(res as T);
    });
  });
}

export function Popup({ edition = getEdition() }: { edition?: Edition } = {}) {
  const showChessCom = edition !== "lichess";
  const showLichess = edition !== "chesscom";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [chessUser, setChessUser] = useState("");
  const [lichessUser, setLichessUser] = useState("");
  const [lichessToken, setLichessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const s = await sendRuntime<Settings>({ type: "ci:settings" });
      setSettings(s);
      setChessUser(s.username ?? "");
      setLichessUser(s.lichessUsername ?? "");
      setLichessToken(s.lichessToken ?? "");
    } catch {
      // Ignored
    }
  }

  const handleSaveChessUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chessUser.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await sendRuntime({ type: "ci:connect", username: chessUser.trim() });
      setMsg({ text: "Chess.com account connected & updated." });
      await loadSettings();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to update", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleConnectLichess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lichessUser.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await sendRuntime({
        type: "ci:lichess-connect",
        username: lichessUser.trim(),
        token: lichessToken.trim() || undefined,
      });
      setMsg({ text: "Lichess connected & sync queued!" });
      await loadSettings();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to connect", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectLichess = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await sendRuntime({ type: "ci:lichess-disconnect" });
      setLichessUser("");
      setLichessToken("");
      setMsg({ text: "Lichess disconnected." });
      await loadSettings();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to disconnect", error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleSyncAll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (showLichess && settings?.lichessUsername) {
        await sendRuntime({ type: "ci:lichess-sync", force: true });
      }
      if (showChessCom && settings?.username) {
        await sendRuntime({
          type: "ci:sync",
          username: settings.username,
          years: [new Date().getFullYear()],
          force: true,
        });
      }
      setMsg({ text: "Sync requested successfully!" });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Sync failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  const isLichessConnected = Boolean(settings?.lichessUsername);
  const title =
    edition === "chesscom"
      ? "Chess.com Heatmap"
      : edition === "lichess"
        ? "Lichess Heatmap"
        : "Chess Heatmap";
  const icon = edition === "lichess" ? "♞" : "♟️";

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ci-border)", paddingBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>{icon}</span>
          <div>
            <h1 style={{ fontSize: "14px", fontWeight: "700" }}>{title}</h1>
            <p style={{ fontSize: "11px", color: "var(--ci-muted)" }}>Activity Heatmap Settings</p>
          </div>
        </div>
        <span style={{ fontSize: "11px", color: "var(--ci-muted)", background: "var(--ci-card)", padding: "2px 6px", borderRadius: "4px" }}>
          v{version}
        </span>
      </div>

      {msg && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: "6px",
            fontSize: "12px",
            background: msg.error ? "#fde8e8" : "#edf7ed",
            color: msg.error ? "#9b1c1c" : "#1e4620",
            border: `1px solid ${msg.error ? "#f8b4b4" : "#bcf0da"}`,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Chess.com Username */}
      {showChessCom && (
        <section style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--ci-text)" }}>
            Chess.com Account
          </label>
          <form onSubmit={handleSaveChessUser} style={{ display: "flex", gap: "6px" }}>
            <input
              type="text"
              value={chessUser}
              onChange={(e) => setChessUser(e.target.value)}
              placeholder="Username"
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: "5px",
                border: "1px solid var(--ci-border)",
                background: "var(--ci-card)",
                color: "var(--ci-text)",
                fontSize: "12px",
              }}
            />
            <button
              type="submit"
              disabled={busy || !chessUser.trim()}
              style={{
                padding: "6px 12px",
                borderRadius: "5px",
                background: "var(--ci-accent)",
                color: "#fff",
                border: "none",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </form>
        </section>
      )}

      {/* Lichess Integration */}
      {showLichess && (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            borderTop: showChessCom ? "1px solid var(--ci-border)" : "none",
            paddingTop: showChessCom ? "12px" : "0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: "600" }}>
              {edition === "lichess" ? "♞ Lichess Account" : "♞ Lichess Integration"}
            </span>
          <span
            style={{
              fontSize: "10px",
              fontWeight: "700",
              padding: "2px 6px",
              borderRadius: "3px",
              background: isLichessConnected ? "#def7ec" : "var(--ci-card)",
              color: isLichessConnected ? "#03543f" : "var(--ci-muted)",
            }}
          >
            {isLichessConnected ? "CONNECTED" : "NOT LINKED"}
          </span>
        </div>

        <p style={{ fontSize: "11px", color: "var(--ci-muted)" }}>
          Sync games and puzzles from Lichess. Live puzzles on /training are tracked automatically; add a token to import past puzzle history.
        </p>

        <form onSubmit={handleConnectLichess} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <input
            type="text"
            value={lichessUser}
            onChange={(e) => setLichessUser(e.target.value)}
            placeholder="Lichess Username"
            style={{
              padding: "6px 8px",
              borderRadius: "5px",
              border: "1px solid var(--ci-border)",
              background: "var(--ci-card)",
              color: "var(--ci-text)",
              fontSize: "12px",
            }}
          />

          <div style={{ position: "relative" }}>
            <input
              type={showToken ? "text" : "password"}
              value={lichessToken}
              onChange={(e) => setLichessToken(e.target.value)}
              placeholder="Personal Access Token (optional for puzzles)"
              style={{
                width: "100%",
                padding: "6px 28px 6px 8px",
                borderRadius: "5px",
                border: "1px solid var(--ci-border)",
                background: "var(--ci-card)",
                color: "var(--ci-text)",
                fontSize: "12px",
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              style={{
                position: "absolute",
                right: "6px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: "11px",
                color: "var(--ci-muted)",
              }}
            >
              {showToken ? "🙈" : "👁️"}
            </button>
          </div>

          <a
            href="https://lichess.org/account/oauth/token/create?scopes[]=puzzle:read"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "11px", color: "var(--ci-accent)", textDecoration: "none" }}
          >
            Create token with puzzle:read scope ↗
          </a>

          <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
            <button
              type="submit"
              disabled={busy || !lichessUser.trim()}
              style={{
                flex: 1,
                padding: "7px 10px",
                borderRadius: "5px",
                background: "var(--ci-accent)",
                color: "#fff",
                border: "none",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              {isLichessConnected ? "Update Lichess" : "Connect Lichess"}
            </button>
            {isLichessConnected && (
              <button
                type="button"
                onClick={handleDisconnectLichess}
                disabled={busy}
                style={{
                  padding: "7px 10px",
                  borderRadius: "5px",
                  background: "transparent",
                  color: "var(--ci-danger)",
                  border: "1px solid var(--ci-border)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        </form>
      </section>
      )}

      {/* Sync Footer */}
      <footer style={{ borderTop: "1px solid var(--ci-border)", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={handleSyncAll}
          disabled={busy}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: "6px",
            background: "var(--ci-card)",
            color: "var(--ci-text)",
            border: "1px solid var(--ci-border)",
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          {busy ? "Syncing..." : "↻ Trigger Refresh"}
        </button>
      </footer>
    </div>
  );
}
