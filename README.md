# Chess.com Activity Heatmap

[![CI](https://github.com/phunguyen1006/chess-heatmap/actions/workflows/ci.yml/badge.svg)](https://github.com/phunguyen1006/chess-heatmap/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/phunguyen1006/chess-heatmap?include_prereleases&color=6a9947)](https://github.com/phunguyen1006/chess-heatmap/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-brightgreen)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)](https://www.typescriptlang.org/)

A lightweight, local-first Chrome extension that injects an interactive GitHub-style annual contribution heatmap directly into your Chess.com homepage.

<p align="center">
  <img src="public/icons/icon128.png" alt="Chess.com Activity Heatmap Logo" width="128" height="128" />
</p>

---

## 🌟 Key Features

- **GitHub-style Contribution Calendar**: Visualizes your daily game and puzzle activity across 52 weeks with 5 quantile intensity levels.
- **Year, Mode & Platform Navigation**: Browse your activity across any year, switch between All / Games / Puzzles activity modes, and filter by platform (`All Platforms`, `Chess.com`, `Lichess`).
- **Lichess Multi-Platform Synchronization**: Seamlessly integrate your Lichess account to sync mobile puzzle training and games into your unified Chess.com heatmap.
- **Day Detail Breakdown**: Click any cell on the heatmap to expand an interactive breakdown of all games and puzzles played that day, with platform badges (`♟️ Chess.com` vs `♞ Lichess`), openings, time controls, and direct links.
- **Streak & Stats Tracking**: Displays current streak (with past years correctly showing longest streak), longest streak, total games/puzzles, and daily win/loss breakdown in interactive tooltips.
- **Seamless DOM Integration**: Injects into the Chess.com homepage layout directly below "Play Online" and above native recommendation cards, with zero layout shift and zero interference with native buttons.
- **Dynamic SPA Resilience**: Automatically handles SPA route changes and delayed rendering using `ResizeObserver` and `MutationObserver`.
- **Theme Matching**: Automatically respects light and dark modes and adapts to Chess.com's native button and background palette.
- **Rated Puzzle Tracker**: Live DOM state machine that tracks completed rated puzzle attempts on `/puzzles/rated`.
- **Local-First & Private**: Direct communication with the public Chess.com & Lichess APIs; Personal Access Tokens and historical data are stored 100% locally in `chrome.storage.local` and IndexedDB.

---

## 📦 Quick Installation

### Option 1: Install Pre-built Release (Recommended)

1. Download the latest `chess-heatmap-vX.X.X.zip` from the [Releases](https://github.com/phunguyen1006/chess-heatmap/releases) page.
2. Unzip the downloaded file to a permanent folder on your computer.
3. Open Google Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** using the toggle switch in the top-right corner.
5. Click the **Load unpacked** button in the top-left.
6. Select the unzipped folder containing `manifest.json`.
7. Navigate to [chess.com/home](https://www.chess.com/home) and your heatmap will be automatically mounted!

### Option 2: Build From Source

```bash
# Clone the repository
git clone https://github.com/phunguyen1006/chess-heatmap.git
cd chess-heatmap

# Install dependencies
npm install

# Build extension
npm run build
```

Then load the generated `dist/` directory into Chrome via `chrome://extensions/` as an unpacked extension.

---

## 🛠️ Architecture

- **Extension Framework**: Chrome Extension Manifest V3.
- **Hybrid Bundling**:
  - **Vite**: Compiles the ES module background service worker (`src/background/serviceWorker.ts`).
  - **esbuild**: Compiles the isolated IIFE content script (`src/content/chessComContent.tsx` -> `dist/content.js` & `dist/content.css`) to guarantee seamless execution inside the Chess.com DOM.
- **Local Database**: IndexedDB schema (`chess-heatmap-db`) storing normalized games, sync metadata, profile archives, and puzzle attempt records.
- **Intensity Algorithm**: Dataset-wide quantile calculations (`[0.2, 0.4, 0.6, 0.8]`) mapping game & puzzle density to 5 GitHub-style green intensity tiers.

---

## 💻 Development Commands

| Command | Description |
| :--- | :--- |
| `npm run typecheck` | Run TypeScript compiler type checking without emitting files |
| `npm test` | Run Vitest unit & integration test suite |
| `npm run build` | Full production build (`tsc` + `vite build` + `esbuild`) |
| `npm run package` | Build and create distributable ZIP archive with SHA-256 checksums |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/phunguyen1006/chess-heatmap/issues). See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
