import { useEffect, useState } from "react";
import type { DataState } from "../state/useData";
import type { Platform } from "../../shared/types";

export function Setup({
  state,
  detected,
  onConnected,
  hostPlatform = "chesscom",
}: {
  state: DataState;
  detected: string | null;
  onConnected?: () => void;
  hostPlatform?: Platform;
}) {
  const [input, setInput] = useState(detected ?? ""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);

  useEffect(() => {
    if (detected && !input) setInput(detected);
  }, [detected, input]);

  const isLichess = hostPlatform === "lichess";

  return (
    <form
      className="ci-setup"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void state
          .connect(input, isLichess ? token : undefined)
          .then((success) => {
            if (success) onConnected?.();
          })
          .finally(() => setBusy(false));
      }}
    >
      <p>
        {isLichess
          ? "Connect your Lichess account. Public games and live puzzles on /training are tracked automatically; add a token (puzzle:read) to import past puzzle history."
          : "Connect your public Chess.com history. All data stays local on this device."}
      </p>
      <label>
        {isLichess ? "Lichess username " : "Chess.com username "}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          required
          autoComplete="off"
          pattern={"[a-zA-Z0-9_\\-]{2,30}"}
        />
      </label>
      {isLichess && (
        <label>
          Personal Access Token (optional, for puzzle history){" "}
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            placeholder="lip_..."
          />
        </label>
      )}
      <button className="ci-primary" disabled={busy}>
        {busy ? "Connecting…" : "Connect"}
      </button>
      {isLichess && (
        <p style={{ fontSize: "12px" }}>
          <a
            href="https://lichess.org/account/oauth/token/create?scopes[]=puzzle:read"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create a Lichess token with puzzle:read scope ↗
          </a>
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
