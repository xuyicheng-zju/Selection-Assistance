import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// 多入口:主窗口 / 划词浮窗 / 悬浮按钮
export default defineConfig({
  plugins: [
    react(),
    {
      name: "desktop-content-policy",
      apply: "build",
      transformIndexHtml() {
        return [{
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
              + "img-src 'self' data: blob:; connect-src http://127.0.0.1:* http://localhost:* data:; "
              + "object-src 'none'; base-uri 'none'; form-action 'none'",
          },
          injectTo: "head-prepend",
        }];
      },
    },
  ],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        popup: path.resolve(__dirname, "popup.html"),
        actionButton: path.resolve(__dirname, "actionButton.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
