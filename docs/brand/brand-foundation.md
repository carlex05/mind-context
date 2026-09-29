# MindContext — Constellation Brand Foundation

Status: **v1 approved**  
Approved direction: **Constellation / Linked Star**  
Approved: 2026-09-29

## Brand idea

MindContext turns scattered notes into connected context.

The visual system represents knowledge as a living constellation: individual
ideas remain understandable on their own, while links reveal a larger structure.
The identity should feel calm, intelligent, technical and trustworthy rather
than decorative or "AI futuristic".

Primary product line:

> **Turn scattered notes into connected context.**

Supporting product messages:

- **Your second brain. In your own Drive.**
- **Your thoughts. Your files. Your context.**
- **Free to use. Open by design.**

When describing authentication, prefer **"No separate MindContext account"**.
Do not claim that no account is required because Google Drive access requires a
Google account.

## Logo — Linked Star

The Linked Star is the primary symbol. Five nodes form a compact constellation
that subtly suggests an M without depending on the letterform.

Rules:

- Blue nodes/lines represent relationships and context.
- One amber node represents the current signal, discovery or point of focus.
- The mark must remain recognizable without glow.
- Do not turn the symbol into a brain, sparkles, neural-network cliché or
  generic AI badge.
- Minimum digital size: 24 px. Prefer the simplified favicon asset below 32 px.
- Preserve clear space of at least one node diameter around the mark.

Canonical assets:

- `apps/web/public/brand/mindcontext-mark.svg`
- `apps/web/public/brand/mindcontext-lockup.svg`
- `apps/web/public/brand/favicon.svg`
- `apps/web/public/brand/app-icon.svg`

## Palette

| Token | Hex | Meaning |
| --- | --- | --- |
| Night | `#0A0D16` | Primary dark background |
| Panel | `#121827` | Dark raised surfaces |
| Text | `#F1F4FA` | Primary text on dark surfaces |
| Muted | `#8C95A8` | Secondary text |
| Context Blue | `#7A8DFF` | Connections, links, graph, navigation |
| Deep Blue | `#536FD8` | Structural/accessible blue, especially light mode |
| Focus Amber | `#FFB257` | Active focus and discovery |
| Pale Amber | `#FFD79A` | Soft supporting amber |

### Semantic rule

**Blue is the dominant accent. Amber is exceptional.**

Use blue for navigation, links, relationship lines, selected structural
controls and graph neighbors. Use amber only when something is the current
focus, pending attention or a meaningful discovery. A screen should generally
read as blue before it reads as amber.

Derived light/dark surface tokens live in
`packages/design-system/src/tokens.css`. Those semantic tokens, not raw hex
values, should be used by product UI.

## Typography

- **Headings:** Manrope
- **Body/UI:** Inter
- **Technical/Markdown:** JetBrains Mono

The core app currently declares these faces with privacy-safe local/system
fallbacks and makes no third-party font requests. If exact font files are added
later, they must be bundled or self-hosted.

Headings should be compact and confident. Body text should prioritize long-form
readability. Mono is for Markdown/code/technical metadata, not decoration.

## Iconography

Use a consistent outline language:

- approximately 1.75–2 px stroke at the common 18–20 px icon size;
- rounded line caps and joins;
- minimal fill;
- simple geometry;
- custom icons only when a product concept (Linked Star, graph, wikilink,
  plugin, vault/local AI) benefits from distinctive treatment.

Generic controls can continue to use the existing internal outline icon set.

## Motion and glow

Constellation motion should imply that the knowledge system is alive without
becoming visual noise.

- Prefer 120–180 ms UI transitions.
- Graph/node motion may be slower when it communicates topology.
- No perpetual pulsing except real activity/status.
- Glow is reserved for the Linked Star, current graph node and occasional
  primary CTA emphasis.
- Avoid large neon gradients, lens flares and ambient Web3/AI visual effects.

## Themes

Dark is the primary marketing/brand presentation.

Light mode is a first-class product mode, not a color inversion. It uses clean
neutral surfaces, Deep Blue for accessible actions and the same semantic
meaning for blue/amber.

User theme preference remains `system | light | dark`; the brand does not
override a user's selected theme.

## Product application

The editor remains calm and content-first. Constellation identity appears most
strongly in:

- logo and favicon;
- navigation selection and focus rings;
- local/global graph;
- sync/pending status accents;
- empty states/onboarding;
- public site and product illustrations.

Do **not** add decorative stars or orbit lines behind the Markdown editor.

## Privacy and brand behavior

Brand implementation must reinforce the product promise:

- no tracking added for visual/brand purposes;
- no remote font or image request required to render the core interface;
- no user note content used in marketing visuals automatically;
- Markdown and user-owned storage remain the product foundation.

## Implementation source of truth

Shared primitive and semantic tokens:

`packages/design-system/src/tokens.css`

Typed brand metadata:

`packages/design-system/src/index.ts`

Future `apps/site` work should import the same token package rather than
recreating the palette.
