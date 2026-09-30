import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const require = createRequire(import.meta.url);

function packageRoot(specifier: string): string {
  let current = path.dirname(require.resolve(specifier));

  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not resolve package root for ${specifier}`);
    }
    current = parent;
  }
}

const excalidrawFonts = path.join(
  packageRoot("@excalidraw/excalidraw"),
  "dist/prod/fonts/*",
);

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(excalidrawFonts),
          dest: "excalidraw-assets/fonts",
        },
      ],
    }),
  ],
});
