import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// IMPORTANT:
// The `lovable-tagger` plugin injects code that expects a companion browser extension.
// When those extension files aren't present (utils.js, extensionState.js, heuristicsRedefinitions.js),
// it throws “Cannot access 'ht' before initialization” and 404s in dev tools.
// We disable/remove it to keep the app stable.

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(), // only React SWC – no lovable-tagger
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
