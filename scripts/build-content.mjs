import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const baseManifest = JSON.parse(
  await readFile("public/manifest.json", "utf8"),
);

function sharedEsbuildConfig(edition) {
  return {
    bundle: true,
    format: "iife",
    target: "chrome120",
    minify: true,
    define: {
      "import.meta.env.DEV": "false",
      "process.env.NODE_ENV": '"production"',
      __CHESS_HEATMAP_EDITION__: JSON.stringify(edition),
    },
  };
}

function createManifestForEdition(edition) {
  const m = structuredClone(baseManifest);
  if (edition === "chesscom") {
    m.name = "Chess.com Activity Heatmap";
    m.description =
      "Interactive GitHub-style annual activity heatmap directly on your Chess.com homepage.";
    m.action.default_title = "Chess.com Activity Heatmap Settings";
    m.permissions = ["storage"];
    m.host_permissions = [
      "https://www.chess.com/*",
      "https://api.chess.com/*",
    ];
    m.content_scripts = [
      {
        matches: ["https://www.chess.com/*"],
        js: ["content.js"],
        css: ["content.css"],
        run_at: "document_idle",
      },
    ];
  } else if (edition === "lichess") {
    m.name = "Lichess Activity Heatmap";
    m.description =
      "Interactive GitHub-style annual activity heatmap directly on your Lichess lobby and profile.";
    m.action.default_title = "Lichess Activity Heatmap Settings";
    m.permissions = ["storage", "alarms"];
    m.host_permissions = ["https://lichess.org/*"];
    m.content_scripts = [
      {
        matches: ["https://lichess.org/*"],
        js: ["lichess-content.js"],
        css: ["lichess-content.css"],
        run_at: "document_idle",
      },
    ];
  } else {
    m.name = "Chess Activity Heatmap (Chess.com & Lichess)";
    m.description =
      "Interactive GitHub-style annual activity heatmap directly on your Chess.com and Lichess pages.";
    m.action.default_title = "Chess Activity Heatmap Settings";
  }
  return m;
}

// 1. Finish building the default Combined ('all') edition in dist/
await Promise.all([
  esbuild({
    ...sharedEsbuildConfig("all"),
    entryPoints: ["src/content/chessComContent.tsx"],
    outfile: "dist/content.js",
  }),
  esbuild({
    ...sharedEsbuildConfig("all"),
    entryPoints: ["src/content/lichessContent.tsx"],
    outfile: "dist/lichess-content.js",
  }),
]);
await writeFile(
  "dist/manifest.json",
  JSON.stringify(createManifestForEdition("all"), null, 2) + "\n",
);

// 2. Build dedicated single-platform editions: dist-chesscom/ and dist-lichess/
async function buildSinglePlatformEdition(edition, outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await viteBuild({
    configFile: "vite.config.ts",
    logLevel: "warn",
    define: {
      __CHESS_HEATMAP_EDITION__: JSON.stringify(edition),
    },
    build: {
      outDir,
      emptyOutDir: true,
    },
  });

  if (edition === "chesscom") {
    await esbuild({
      ...sharedEsbuildConfig("chesscom"),
      entryPoints: ["src/content/chessComContent.tsx"],
      outfile: `${outDir}/content.js`,
    });
  } else if (edition === "lichess") {
    await esbuild({
      ...sharedEsbuildConfig("lichess"),
      entryPoints: ["src/content/lichessContent.tsx"],
      outfile: `${outDir}/lichess-content.js`,
    });
  }

  await cp("public/icons", `${outDir}/icons`, { recursive: true });
  await writeFile(
    `${outDir}/manifest.json`,
    JSON.stringify(createManifestForEdition(edition), null, 2) + "\n",
  );
}

await buildSinglePlatformEdition("chesscom", "dist-chesscom");
await buildSinglePlatformEdition("lichess", "dist-lichess");
