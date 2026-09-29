import { defineConfig } from "astro/config";

const configuredBaseUrl = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const repositoryOwner = process.env.GITHUB_REPOSITORY_OWNER;

let site: string;
let base: string;

if (configuredBaseUrl) {
  const pagesUrl = new URL(configuredBaseUrl);
  site = pagesUrl.origin;
  base =
    pagesUrl.pathname === "/"
      ? "/"
      : pagesUrl.pathname.replace(/\/+$/, "");
} else {
  site = repositoryOwner
    ? `https://${repositoryOwner}.github.io`
    : "http://localhost:4321";
  base = repositoryName ? `/${repositoryName}` : "/";
}

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
});
