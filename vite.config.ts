import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { exportBridge } from "./vite-plugin-export-bridge.js";

export default defineConfig({
  plugins: [svelte(), exportBridge()],
  build: {
    outDir: "dist",
    // Increase chunk size warning limit to 1.2 MB to avoid noisy warnings
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
  base: "./",
});
