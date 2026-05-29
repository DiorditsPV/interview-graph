import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В dev фронт на :5173 проксирует /api на бэкенд :8000.
// В прод фронт собирается в dist/ и раздаётся самим FastAPI (тот же origin).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
  },
});
