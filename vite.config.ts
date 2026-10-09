import { defineConfig } from "vite";

// Relative base: the build works under any path, e.g. GitHub Pages at /premia-timeline/.
export default defineConfig({ base: "./", build: { target: "es2022", chunkSizeWarningLimit: 1200 } });
