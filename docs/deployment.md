# Public preview deployment

The repository contains a GitHub Pages workflow at:

```text
.github/workflows/pages.yml
```

It builds the static Vite application and publishes `apps/web/dist`.

## GitHub Pages

GitHub Pages must use **GitHub Actions** as its publishing source.

Expected project URL:

```text
https://carlex05.github.io/mind-context/
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

Every push to `main` rebuilds and deploys GitHub Pages automatically.

The deployed application uses Google Identity Services directly in the browser.
Access tokens remain browser-session state and are not sent to MindContext
infrastructure.
