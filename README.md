# Chess.com Activity Heatmap

A lightweight, local-first Chrome extension (Manifest V3) that embeds an interactive GitHub-style annual contribution heatmap directly into your Chess.com homepage.

![Chess.com Activity Heatmap](public/icons/icon128.png)

## Features

- **GitHub-style Contribution Calendar**: Visualizes your daily activity across 52 weeks with 5 quantile intensity levels.
- **Year & Mode Navigation**: Browse activity across any year, viewing games, rated puzzles, or combined activity.
- **Streak & Stats Tracking**: Displays current streak, longest streak, total games/puzzles, and daily win/loss breakdown in interactive tooltips.
- **Native Layout Integration**: Injects seamlessly into the Chess.com homepage grid right below "Play Online" and above native recommendation cards, with zero layout shift.
- **Theme Matching**: Automatically respects light and dark modes and adapts to Chess.com's native button and background palette.
- **Rated Puzzle Tracker**: Live DOM state machine that tracks completed rated puzzle attempts on `/puzzles/rated`.
- **Local-First & Private**: Direct communication with the public Chess.com API; all archive data, profile records, and puzzle history are stored locally in IndexedDB.

## Tech Stack

- **React 19** & **TypeScript**
- **Vite** (Service Worker bundler) & **esbuild** (Isolated IIFE Content Script bundler)
- **IndexedDB** for local caching
- **Vitest** with JSDOM for testing

## Installation & Development

### 1. Install dependencies

```bash
npm install
```

### 2. Build the extension

```bash
npm run build
```

This compiles:
- `dist/background.js` (Vite ES module background service worker)
- `dist/content.js` and `dist/content.css` (esbuild IIFE bundle injected into Chess.com)
- Copies `manifest.json` and extension icons into `dist/`

### 3. Load into Google Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** on (top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this repository
5. Navigate to [chess.com/home](https://www.chess.com/home) to see your activity heatmap

### 4. Running Tests

```bash
npm test
```

## License

GPL-3.0-only
