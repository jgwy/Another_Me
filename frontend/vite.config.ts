import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
    // Behind the compose `gateway` (and EdgeOne) the Host header is the public
    // domain, not localhost; allow it so the preview server doesn't 403.
    allowedHosts: true,
  },
});
