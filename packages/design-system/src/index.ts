export const mindContextBrand = {
  name: "MindContext",
  visualName: "MindContext — Constellation",
  direction: "Constellation",
  mark: "Linked Star",
  tagline: "Turn scattered notes into connected context.",
  colors: {
    night: "#0A0D16",
    panel: "#121827",
    text: "#F1F4FA",
    muted: "#8C95A8",
    contextBlue: "#7A8DFF",
    deepBlue: "#536FD8",
    focusAmber: "#FFB257",
    paleAmber: "#FFD79A",
  },
  typography: {
    heading: "Manrope",
    body: "Inter",
    mono: "JetBrains Mono",
  },
  semantics: {
    blue: "Connections, links, graph relationships and navigation.",
    amber: "Active focus, discovery and the current important item.",
    glow: "Use sparingly to reinforce hierarchy, never as ambient noise.",
  },
} as const;

export type MindContextBrand = typeof mindContextBrand;
