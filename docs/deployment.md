# Public deployment

The repository contains a GitHub Pages workflow at:

```text
.github/workflows/pages.yml
```

It builds both surfaces, composes the React application into the Astro site at
`/app/`, and publishes `apps/site/dist`.

## Production configuration

The deployment URL is discovered directly from GitHub Pages with
`actions/configure-pages`. This is the source of truth for Astro's canonical
origin and base path, so changing between a project URL and a custom domain does
not require a committed or manually maintained site URL.

Production identifiers are not committed to the repository. Configure these as
repository variables in **Settings → Secrets and variables → Actions → Variables**
or as variables/secrets on the `github-pages` environment:

| Variable | Example shape | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | `123...apps.googleusercontent.com` | Google OAuth Web Client ID injected into the React build |
| `GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Optional GA4 measurement ID for the public site |

These values are public browser/build identifiers, not passwords. Keeping them
outside source prevents forks and local clones from inheriting MindContext's
production identifiers.

If `GOOGLE_CLIENT_ID` is absent, the Pages deployment fails before publishing
instead of silently shipping a build with Google Drive disabled.

If `GA_MEASUREMENT_ID` is absent or invalid, the site can still deploy, but no
analytics consent UI or Google Analytics script is emitted.

## Analytics boundary

GA4 is integrated only into the Astro public site. It is not included in the
React workspace under `/app/`.

The public site uses explicit opt-in. Until the visitor accepts, Google's
analytics script is not loaded and no analytics request is sent. A footer
control lets the visitor reopen analytics preferences.

The first explicit conversion event is `open_app`, emitted from public-site
"Open MindContext" navigation CTAs after consent. Standard GA4 page views cover
landing page, referrer, campaign and locale-level acquisition analysis.

## Google OAuth configuration

The Google Cloud OAuth Web Client must authorize the exact HTTPS origin reported
by GitHub Pages, for example:

```text
https://mindcontext.app
```

For local development it can additionally authorize:

```text
http://localhost:5173
```

OAuth client IDs are public application identifiers, not secrets. A Google
client secret MUST NOT be committed or embedded in the browser application.

## GitHub Pages custom domain

GitHub Pages must use **GitHub Actions** as its publishing source.

Configure the custom domain in **Repository Settings → Pages → Custom domain**.
DNS remains managed by the registrar. Once GitHub validates DNS and provisions
the certificate, enable **Enforce HTTPS**.

The workflow reads GitHub Pages' own `base_url`, so the generated asset URLs,
canonical URLs and language links automatically follow the active custom domain.

## Deployment behavior

Every push to `main` rebuilds the shared packages, React app and Astro public
site. `scripts/compose-pages.mjs` then copies the app build under the site's
`/app/` directory before GitHub Pages uploads the final static artifact.
