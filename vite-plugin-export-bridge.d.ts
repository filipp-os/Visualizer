import type { Plugin } from "vite";

/** Local filesystem export bridge for the visualizer (dev + preview server). */
export function exportBridge(): Plugin;
export default exportBridge;
