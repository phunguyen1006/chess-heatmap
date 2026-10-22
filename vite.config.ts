import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        background: "src/background/serviceWorker.ts",
        popup: "popup.html",
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
