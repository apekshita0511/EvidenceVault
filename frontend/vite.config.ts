import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to the Express backend so the browser stays same-origin (no CORS needed).
const target = process.env.API_PROXY_TARGET || "http://localhost:5000";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": target } },
});