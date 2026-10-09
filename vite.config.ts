import { defineConfig } from "vite";

// Relative base: the build works under any path, e.g. GitHub Pages at /premia-timeline/.
export default defineConfig({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  // Appended to data and texture URLs so a new deploy never mixes with cached data.
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
});
