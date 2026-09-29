import { defineConfig } from "astro/config";

const configuredSite = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const repositoryOwner = process.env.GITHUB_REPOSITORY_OWNER;

const site =
  configuredSite ||
  (repositoryOwner
    ? `https://${repositoryOwner}.github.io`
    : "http://localhost:4321");

const base = configuredSite ? "/" : repositoryName ? `/${repositoryName}` : "/";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
});
