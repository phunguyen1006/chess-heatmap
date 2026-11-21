import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __CHESS_HEATMAP_EDITION__: JSON.stringify(
      process.env.CHESS_HEATMAP_EDITION || "all",
    ),
  },
  build: {
    outDir: process.env.CHESS_HEATMAP_OUT_DIR || "dist",
    rollupOptions: {
      input: {
        background: "src/background/serviceWorker.ts",
        popup: "popup.html",
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
