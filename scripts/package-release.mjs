import {
  copyFile,
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
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (pkg.version !== manifest.version)
  throw new Error("Build and package versions differ. Rebuild first.");

for (const file of [
  "content.js",
  "content.css",
  "background.js",
  "popup.html",
  "manifest.json",
]) {
  if (!(await stat(`dist/${file}`)).size)
    throw new Error(`Missing release file dist/${file}`);
}

for (const file of ["LICENSE", "README.md"]) {
  await copyFile(file, `dist/${file}`);
}

await mkdir("releases", { recursive: true });
const filename = `chess-heatmap-v${pkg.version}.zip`;
const destination = resolve("releases", filename);
await rm(destination, { force: true });

const zipped =
  process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$buildRoot = (Resolve-Path -LiteralPath 'dist').Path
$archive = [IO.Compression.ZipFile]::Open($env:CI_RELEASE_ARCHIVE, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($assetPath in [IO.Directory]::EnumerateFiles($buildRoot, '*', [IO.SearchOption]::AllDirectories)) {
    $entryName = $assetPath.Substring($buildRoot.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $assetPath, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }`,
        ],
        {
          env: { ...process.env, CI_RELEASE_ARCHIVE: destination },
          stdio: "inherit",
        },
      )
    : spawnSync("zip", ["-q", "-r", destination, "."], {
        cwd: "dist",
        stdio: "inherit",
      });

if (zipped.error || zipped.status !== 0)
  throw zipped.error ?? new Error("ZIP packaging failed");

const bytes = await readFile(destination);
const sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile("releases/SHA256SUMS.txt", `${sha256}  ${filename}\n`);
console.log(`Packaged ${filename} (${bytes.length} bytes), SHA-256: ${sha256}`);
