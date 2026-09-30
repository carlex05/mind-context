# ADR-014 — Selection-scoped encryption plugin and locked Markdown blocks

- Status: Accepted
- Date: 2026-09-30

## Context

MindContext needs a third bundled plugin shape that is different from Canvas and
Excalidraw. The feature must encrypt selected Markdown without giving the plugin
storage credentials or unrestricted workspace access. In Reading View, encrypted
content must remain concealed until the user explicitly unlocks it with a
passphrase.

ADR-003 requires capability-based plugin boundaries and forbids extensions from
receiving storage-provider credentials. ADR-006 keeps Markdown/plain files as
the canonical user-owned representation.

## Decision

Encryption is implemented as a bundled first-party extension that consumes
selection-scoped editor APIs, commands, a host-owned secret prompt and a
plugin-owned Markdown block renderer.

The extension receives only these capabilities:

- read the current editor selection;
- replace the current editor selection;
- register commands;
- register a Markdown fenced-block renderer;
- request a transient secret from a host-controlled password dialog.

It does **not** receive a `StorageProvider`, Drive credentials, whole-vault
access or a network capability.

The canonical syntax is a fenced Markdown block:

~~~markdown
```mindcontext-encrypted
{"v":1,"alg":"AES-GCM","kdf":"PBKDF2-SHA256",...}
```
~~~

Version 1 uses:

- AES-GCM with a 256-bit key;
- PBKDF2-HMAC-SHA256;
- 310,000 PBKDF2 iterations;
- a random 16-byte salt per encrypted block;
- a random 12-byte IV per encrypted block;
- authenticated additional data identifying the format version.

The passphrase is never written into Markdown, localStorage, IndexedDB, provider
storage or plugin settings. The host password dialog keeps it only in component
memory for the operation.

Reading View does not render ciphertext or plaintext directly. It renders a
compact lock control. Clicking the lock opens a modal password prompt. On
successful decryption, plaintext exists only in the transient modal component
state and is removed from that state when the modal closes.

Decrypted content is displayed as inert text rather than reparsed Markdown. This
avoids hidden image/network requests or other active rendering caused by
decrypted content.

## Security scope

Encrypted blocks protect the canonical content **after encryption**. This
feature is not secure erasure and does not claim to remove plaintext that may
already exist in:

- earlier provider revisions or backups;
- browser recovery history created before encryption;
- derived indexes/caches built from an earlier plaintext version;
- screenshots, clipboard history or other operating-system/application history.

Normal save/index refresh should stop current derived projections from using the
old plaintext once the encrypted Markdown is canonical, but historical local or
provider artifacts require separate retention/cleanup policies.

## Consequences

- Encryption validates editor/command/Markdown-renderer plugin seams without
  widening plugins to storage access.
- The encrypted representation remains ordinary Markdown and can be preserved
  by editors that know nothing about MindContext.
- Forgetting the passphrase makes the encrypted block unrecoverable by
  MindContext; there is intentionally no recovery key.
- Arbitrary third-party plugin execution remains out of scope until the
  isolation work required by ADR-003 is complete.
