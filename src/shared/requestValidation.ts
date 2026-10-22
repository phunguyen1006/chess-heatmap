import type { Request } from "./types";

export function validRequest(value: unknown): value is Request {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  const username = (name: unknown) =>
    typeof name === "string" && /^[a-zA-Z0-9_-]{2,30}$/.test(name);
  const optionalBoolean = (key: string) =>
    m[key] === undefined || typeof m[key] === "boolean";

  switch (m.type) {
    case "ci:settings":
      return true;
    case "ci:theme-setting":
      return m.theme === "light" || m.theme === "dark";
    case "ci:puzzle-setting":
      return typeof m.enabled === "boolean";
    case "ci:lichess-disconnect":
      return true;
    case "ci:lichess-sync":
      return optionalBoolean("force");
    case "ci:lichess-connect": {
      const u = m.username;
      const validLichessUser =
        typeof u === "string" && /^[a-zA-Z0-9_-]{2,30}$/.test(u);
      const validToken =
        m.token === undefined ||
        (typeof m.token === "string" && m.token.length <= 128);
      return validLichessUser && validToken;
    }
    case "ci:connect":
    case "ci:snapshot":
    case "ci:puzzles":
    case "ci:puzzle-start":
    case "ci:puzzle-clear":
      return username(m.username);
    case "ci:puzzle-save": {
      if (
        !m.attempt ||
        typeof m.attempt !== "object" ||
        Array.isArray(m.attempt)
      )
        return false;
      const a = m.attempt as Record<string, unknown>;
      return (
        username(a.username) &&
        typeof a.id === "string" &&
        !!a.id &&
        typeof a.attemptedAt === "number" &&
        Number.isFinite(a.attemptedAt) &&
        ["solved", "failed", "unknown"].includes(a.result as string)
      );
    }
    case "ci:sync":
      return (
        username(m.username) &&
        optionalBoolean("force") &&
        Array.isArray(m.years) &&
        m.years.length <= 30 &&
        m.years.every(
          (y) =>
            typeof y === "number" &&
            Number.isInteger(y) &&
            y >= 2000 &&
            y <= new Date().getFullYear() + 1,
        )
      );
    default:
      return false;
  }
}
