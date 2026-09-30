import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(
            path.resolve(
              dirname,
              "../../node_modules/@excalidraw/excalidraw/dist/prod/fonts/*",
            ),
          ),
          dest: "excalidraw-assets/fonts",
        },
      ],
    }),
  ],
});
