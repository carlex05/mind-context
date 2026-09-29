import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const siteDist = resolve("apps/site/dist");
const webDist = resolve("apps/web/dist");
const appDist = resolve(siteDist, "app");

await mkdir(siteDist, { recursive: true });
await rm(appDist, { recursive: true, force: true });
await cp(webDist, appDist, { recursive: true });

console.log("Composed public site with MindContext app at /app/.");
