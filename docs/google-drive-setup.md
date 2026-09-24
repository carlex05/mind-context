# Google Drive development setup

MindContext's first storage slice calls Google Drive directly from the browser.

## 1. Create a Google Cloud project

Create or select a Google Cloud project for MindContext.

Enable:

- Google Drive API

The current slice does not require Google Picker because MindContext creates and
re-discovers its own workspace folders.

## 2. Configure OAuth consent

Create an OAuth consent configuration for the project.

The MVP requests only:

```text
https://www.googleapis.com/auth/drive.file
```

Google documents `drive.file` as a narrow, non-sensitive scope that grants the
application access to files it creates or that the user explicitly shares with
the application.

## 3. Create a Web OAuth client

Create an OAuth Client ID with application type **Web application**.

Add authorized JavaScript origins.

Development:

```text
http://localhost:5173
```

Production should use the exact HTTPS origin that serves MindContext.

## 4. Configure the local app

Copy:

```text
.env.example
```

to:

```text
.env.local
```

and set:

```text
VITE_GOOGLE_CLIENT_ID=<your OAuth web client ID>
```

Restart Vite after changing environment variables.

## 5. Run

```bash
pnpm install
pnpm dev
```

## Why the MVP creates its own workspace folder

The `drive.file` scope is intentionally file-scoped. Selecting an arbitrary
pre-existing folder does not reliably grant access to all of that folder's
existing descendants.

For that reason, the MVP:

1. creates a normal Google Drive folder owned by the user;
2. marks that folder using Drive `appProperties`;
3. creates Markdown notes inside it through the Drive API;
4. re-discovers those MindContext-created folders on later sessions.

This preserves narrow permissions instead of asking for broad access to the
user's entire Drive.

A future architecture decision will cover importing arbitrary existing vaults.
Options include explicit file selection/import or an opt-in broader Drive scope,
with the associated Google verification requirements.

## Token handling

The MVP uses Google Identity Services' browser token model:

- the access token is kept in JavaScript memory only;
- MindContext does not receive or store the token;
- no refresh token is stored by MindContext;
- expired sessions require user interaction to authorize again.

This deliberately keeps the first storage path backend-free.
