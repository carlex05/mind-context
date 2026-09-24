# Public preview deployment

The repository contains a GitHub Pages workflow at:

```text
.github/workflows/pages.yml
```

It builds the static Vite application and publishes `apps/web/dist`.

## One-time repository setup

GitHub requires Pages to be enabled for the repository and its publishing source
set to **GitHub Actions**.

In GitHub:

1. Open **Settings**.
2. Open **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

After that, pushes to `main` deploy automatically.

Expected project URL:

```text
https://carlex05.github.io/mind-context/
```

## Public preview without Google OAuth

If the Pages build has no Google Client ID configured, MindContext presents a
local, non-persistent CodeMirror demo. This makes the UI and Markdown behavior
testable from desktop and mobile without credentials.

## Enable real Google Drive in the deployed preview

Create the Google OAuth Web Client ID as described in
`docs/google-drive-setup.md`.

Add this authorized JavaScript origin:

```text
https://carlex05.github.io
```

Then add a GitHub Actions repository variable:

```text
GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
```

The Pages workflow maps that public configuration value to
`VITE_GOOGLE_CLIENT_ID` at build time.

OAuth client IDs are public application identifiers, not client secrets. Do not
put a Google client secret in the frontend or repository variables.

Re-run **Deploy Pages** or push a commit to `main`.
