import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");
const env = loadEnv(process.env.NODE_ENV ?? "development", workspaceRoot, "");
const port = Number(process.env.VITE_PORT ?? env.VITE_PORT ?? 5173);
const basePath = process.env.BASE_PATH ?? env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [mockupPreviewPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
