# ADR-004 — Google Drive `drive.file` scope and app-created workspaces

**Status:** Accepted for MVP

## Context

MindContext needs read/write access to a coherent folder of Markdown files while
preserving least privilege and avoiding a backend knowledge plane.

Google's `drive.file` scope is narrow and non-sensitive. It gives an app access
to files it creates or files explicitly shared/opened with that app. However,
granting access to a pre-existing folder does not imply broad access to all
existing descendants in the way MindContext would need for an arbitrary vault.

Broader Drive scopes would make arbitrary-folder access easier but increase the
permission surface and public-app verification burden.

## Decision

The MVP will use `drive.file`.

MindContext will create workspace folders itself in the user's Drive and mark
them with Drive `appProperties`. Markdown files and subfolders managed by the
MVP will be created through the application.

The web client will use Google Identity Services' token model and keep the
short-lived access token in browser memory only.

## Consequences

- The MVP can remain backend-free for Google Drive access.
- MindContext does not store Google refresh tokens.
- Users may need to reauthorize when an access token expires.
- Arbitrary pre-existing Drive folders are not yet supported as full workspaces.
- Importing an existing vault requires a later ADR.
- A future production version may reassess authorization-code flow if persistent
  authorization becomes important; that can be done without allowing the
  backend to process note contents.
