import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const pkg = JSON.parse(await readFile("package.json", "utf8"));

const EDITIONS = [
  {
    edition: "all",
    dir: "dist",
    archivePrefix: "chess-heatmap",
    requiredFiles: [
      "content.js",
      "content.css",
      "lichess-content.js",
      "lichess-content.css",
      "background.js",
      "popup.html",
      "manifest.json",
    ],
  },
  {
    edition: "chesscom",
    dir: "dist-chesscom",
    archivePrefix: "chesscom-heatmap",
    requiredFiles: [
      "content.js",
      "content.css",
      "background.js",
      "popup.html",
      "manifest.json",
    ],
  },
  {
    edition: "lichess",
    dir: "dist-lichess",
    archivePrefix: "lichess-heatmap",
    requiredFiles: [
      "lichess-content.js",
      "lichess-content.css",
      "background.js",
      "popup.html",
      "manifest.json",
    ],
  },
];

function createZipArchive(sourceDir, destination) {
  if (process.platform === "win32") {
    return spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$buildRoot = (Resolve-Path -LiteralPath $env:CI_BUILD_ROOT).Path
$archive = [IO.Compression.ZipFile]::Open($env:CI_RELEASE_ARCHIVE, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($assetPath in [IO.Directory]::EnumerateFiles($buildRoot, '*', [IO.SearchOption]::AllDirectories)) {
    $entryName = $assetPath.Substring($buildRoot.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $assetPath, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }`,
      ],
      {
        env: {
          ...process.env,
          CI_BUILD_ROOT: sourceDir,
          CI_RELEASE_ARCHIVE: destination,
        },
        stdio: "inherit",
      },
    );
  }

  const zipAttempt = spawnSync("zip", ["-q", "-r", destination, "."], {
    cwd: sourceDir,
    stdio: "inherit",
  });
  if (!zipAttempt.error && zipAttempt.status === 0) {
    return zipAttempt;
  }

  // Fallback to Python's standard library zipfile module if `zip` CLI is not installed
  return spawnSync(
    "python3",
    [
      "-c",
      `import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk(src):
        for f in sorted(files):
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src).replace(os.sep, '/')
            zf.write(full, rel)
`,
      sourceDir,
      destination,
    ],
    { stdio: "inherit" },
  );
}

await mkdir("releases", { recursive: true });
const checksumLines = [];

for (const item of EDITIONS) {
  const manifest = JSON.parse(
    await readFile(`${item.dir}/manifest.json`, "utf8"),
  );
  if (pkg.version !== manifest.version) {
    throw new Error(
      `Build and package versions differ in ${item.dir}. Rebuild first.`,
    );
  }

  for (const file of item.requiredFiles) {
    if (!(await stat(`${item.dir}/${file}`)).size) {
      throw new Error(`Missing release file ${item.dir}/${file}`);
    }
  }

  for (const file of ["LICENSE", "README.md", "CONTRIBUTING.md"]) {
    await copyFile(file, `${item.dir}/${file}`);
  }

  await cp("docs/images", `${item.dir}/docs/images`, { recursive: true });
  await mkdir(`${item.dir}/public/icons`, { recursive: true });
  await copyFile(
    "public/icons/icon128.png",
    `${item.dir}/public/icons/icon128.png`,
  );

  const filename = `${item.archivePrefix}-v${pkg.version}.zip`;
  const destination = resolve("releases", filename);
  await rm(destination, { force: true });

  const zipped = createZipArchive(item.dir, destination);
  if (zipped.error || zipped.status !== 0) {
    throw zipped.error ?? new Error(`ZIP packaging failed for ${filename}`);
  }

  const bytes = await readFile(destination);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  checksumLines.push(`${sha256}  ${filename}`);
  console.log(
    `Packaged ${filename} (${bytes.length} bytes), SHA-256: ${sha256}`,
  );
}

await writeFile("releases/SHA256SUMS.txt", `${checksumLines.join("\n")}\n`);
