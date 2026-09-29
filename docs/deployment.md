# Public preview deployment

The repository contains a GitHub Pages workflow at:

```text
.github/workflows/pages.yml
```

It builds both surfaces, composes the React application into the Astro site at
`/app/`, and publishes `apps/site/dist`.

## GitHub Pages

GitHub Pages must use **GitHub Actions** as its publishing source.

Expected URLs:

```text
https://carlex05.github.io/mind-context/      # public product site
https://carlex05.github.io/mind-context/app/  # Drive-backed application
```

## Google OAuth configuration

The production Google OAuth Web Client ID is public frontend configuration and
is stored in:

```text
apps/web/.env.production
```

The Google Cloud OAuth client must authorize this JavaScript origin:

```text
https://carlex05.github.io
```

For local development it should also authorize:

```text
http://localhost:5173
```

OAuth client IDs are public application identifiers, not secrets. A Google
client secret MUST NOT be committed or embedded in the browser application.

## Deployment behavior

Every push to `main` rebuilds the shared packages, React app and Astro public
site. `scripts/compose-pages.mjs` then copies the app build under the site's
`/app/` directory before GitHub Pages uploads the final static artifact.

The deployed application uses Google Identity Services directly in the browser.
Access tokens remain browser-session state and are not sent to MindContext
infrastructure.
