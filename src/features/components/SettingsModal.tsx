import { useState, useEffect } from "react";
import { send } from "../state/client";
import type { Settings } from "../../shared/types";

export function SettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lichessUser, setLichessUser] = useState("");
  const [lichessToken, setLichessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      void send<Settings>({ type: "ci:settings" }).then((s) => {
        setSettings(s);
        setLichessUser(s.lichessUsername ?? "");
        setLichessToken(s.lichessToken ?? "");
        setMessage(null);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectLichess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lichessUser.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await send({
        type: "ci:lichess-connect",
        username: lichessUser.trim(),
        token: lichessToken.trim() || undefined,
      });
      setMessage({ text: "Lichess account connected successfully!" });
      const updated = await send<Settings>({ type: "ci:settings" });
      setSettings(updated);
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to connect Lichess account.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectLichess = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await send({ type: "ci:lichess-disconnect" });
      setLichessUser("");
      setLichessToken("");
      setMessage({ text: "Lichess account disconnected." });
      const updated = await send<Settings>({ type: "ci:settings" });
      setSettings(updated);
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to disconnect Lichess.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await send({ type: "ci:lichess-sync", force: true });
      setMessage({ text: "Lichess data synced successfully!" });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to sync Lichess data.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ci-modal-backdrop" onClick={onClose}>
      <div
        className="ci-modal-dialog"
        role="dialog"
        aria-labelledby="ci-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ci-modal-header">
          <h3 id="ci-settings-title">Activity Heatmap Settings</h3>
          <button
            type="button"
            className="ci-day-detail-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="ci-modal-body">
          <section className="ci-settings-section">
            <h4>Chess.com Account</h4>
            <p className="ci-settings-hint">
              Connected as <strong>{settings?.username || "Not connected"}</strong>
            </p>
          </section>

          <section className="ci-settings-section">
            <h4>Lichess Integration</h4>
            <p className="ci-settings-hint">
              Connect your Lichess account to automatically pull in your games and practice puzzle activity (including puzzles solved on the mobile app).
            </p>

            <form onSubmit={handleConnectLichess}>
              <div className="ci-field-group">
                <label htmlFor="ci-lichess-username">Lichess Username</label>
                <input
                  id="ci-lichess-username"
                  type="text"
                  value={lichessUser}
                  onChange={(e) => setLichessUser(e.target.value)}
                  placeholder="e.g. magnuscarlsen"
                  required
                  autoComplete="off"
                  disabled={busy}
                />
              </div>

              <div className="ci-field-group">
                <label htmlFor="ci-lichess-token">
                  Personal Access Token{" "}
                  <span className="ci-badge-optional">(Optional, for Puzzles)</span>
                </label>
                <div className="ci-token-input-wrap">
                  <input
                    id="ci-lichess-token"
                    type={showToken ? "text" : "password"}
                    value={lichessToken}
                    onChange={(e) => setLichessToken(e.target.value)}
                    placeholder="lip_xxxxxxxxxxxx"
                    autoComplete="off"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="ci-token-toggle"
                    onClick={() => setShowToken(!showToken)}
                    tabIndex={-1}
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
                <small className="ci-token-guide">
                  Needed to read your puzzle activity. Create a token at{" "}
                  <a
                    href="https://lichess.org/account/oauth/token"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    lichess.org/account/oauth/token ↗
                  </a>{" "}
                  with only the <code>puzzle:read</code> scope selected. Token is stored securely in your browser's local storage.
                </small>
              </div>

              <div className="ci-settings-actions">
                <button
                  type="submit"
                  className="ci-primary"
                  disabled={busy || !lichessUser.trim()}
                >
                  {busy ? "Saving…" : settings?.lichessUsername ? "Update Lichess" : "Connect Lichess"}
                </button>

                {settings?.lichessUsername && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSyncNow}
                      title="Sync latest games and puzzles from Lichess now"
                    >
                      ↻ Sync Lichess
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="ci-danger-btn"
                      onClick={handleDisconnectLichess}
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </form>
          </section>

          {message && (
            <p
              className={`ci-status-banner ${message.error ? "ci-status-error" : "ci-status-success"}`}
              role="alert"
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
