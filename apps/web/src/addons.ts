import type { WebExtensionBundle } from "./extensions/ExtensionHost";

export type AddonId =
  | "mindcontext.canvas"
  | "mindcontext.excalidraw"
  | "mindcontext.encryption";

export interface AddonDefinition {
  readonly id: AddonId;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly creationKind?: "canvas" | "excalidraw";
}

export type AddonPreferences = Readonly<Record<AddonId, boolean>>;

const STORAGE_KEY = "mindcontext.addons.enabled.v1";

export const ADDONS: readonly AddonDefinition[] = [
  {
    id: "mindcontext.canvas",
    titleKey: "addons.canvas.title",
    descriptionKey: "addons.canvas.description",
    creationKind: "canvas",
  },
  {
    id: "mindcontext.excalidraw",
    titleKey: "addons.excalidraw.title",
    descriptionKey: "addons.excalidraw.description",
    creationKind: "excalidraw",
  },
  {
    id: "mindcontext.encryption",
    titleKey: "addons.encryption.title",
    descriptionKey: "addons.encryption.description",
  },
];

export function defaultAddonPreferences(): AddonPreferences {
  return {
    "mindcontext.canvas": true,
    "mindcontext.excalidraw": true,
    "mindcontext.encryption": true,
  };
}

export function readAddonPreferences(): AddonPreferences {
  const defaults = defaultAddonPreferences();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      "mindcontext.canvas":
        typeof parsed["mindcontext.canvas"] === "boolean"
          ? parsed["mindcontext.canvas"]
          : defaults["mindcontext.canvas"],
      "mindcontext.excalidraw":
        typeof parsed["mindcontext.excalidraw"] === "boolean"
          ? parsed["mindcontext.excalidraw"]
          : defaults["mindcontext.excalidraw"],
      "mindcontext.encryption":
        typeof parsed["mindcontext.encryption"] === "boolean"
          ? parsed["mindcontext.encryption"]
          : defaults["mindcontext.encryption"],
    };
  } catch {
    return defaults;
  }
}

export function writeAddonPreferences(preferences: AddonPreferences): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export async function loadAddonBundle(id: AddonId): Promise<WebExtensionBundle> {
  if (id === "mindcontext.canvas") {
    return (await import("./plugins/canvasPlugin")).canvasPlugin;
  }
  if (id === "mindcontext.excalidraw") {
    return (await import("./plugins/excalidrawPlugin")).excalidrawPlugin;
  }
  return (await import("./plugins/encryptionPlugin")).encryptionPlugin;
}

export function addonEnabled(
  preferences: AddonPreferences,
  id: AddonId,
): boolean {
  return preferences[id];
}
