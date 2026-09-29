# Public deployment

The repository contains a GitHub Pages workflow at:

```text
.github/workflows/pages.yml
```

It builds both surfaces, composes the React application into the Astro site at
`/app/`, and publishes `apps/site/dist`.

## Production configuration

Production identifiers are not committed to the repository. Configure these
repository variables in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Example shape | Purpose |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | `https://your-domain.example` | Astro canonical origin and root-domain deployment |
| `GOOGLE_CLIENT_ID` | `123...apps.googleusercontent.com` | Google OAuth Web Client ID injected into the React build |
| `GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Optional GA4 measurement ID for the public site |

These values are public browser/build identifiers, not secrets, but keeping them
in Actions variables prevents forks and local clones from inheriting the
production project's identifiers.

If `PUBLIC_SITE_URL` is absent, Astro automatically falls back to the
repository's GitHub Pages project URL and project base path. This keeps CI and
fork builds usable without production configuration.

If `GOOGLE_CLIENT_ID` is absent, the app still builds and local-vault support
remains available, but Google Drive sign-in is disabled.

If `GA_MEASUREMENT_ID` is absent or invalid, no analytics consent UI or Google
Analytics script is emitted.

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

The Google Cloud OAuth Web Client must authorize the exact HTTPS origin
configured in `PUBLIC_SITE_URL`.

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

## Deployment behavior

Every push to `main` rebuilds the shared packages, React app and Astro public
site. `scripts/compose-pages.mjs` then copies the app build under the site's
`/app/` directory before GitHub Pages uploads the final static artifact.
