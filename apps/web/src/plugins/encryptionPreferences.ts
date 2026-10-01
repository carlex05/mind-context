export type EncryptionCodecId =
  | "encrypt-selection"
  | "inline-encrypter"
  | "meld"
  | "mindcontext";

export interface EncryptionPreferences {
  readonly defaultCodec: EncryptionCodecId;
}

const STORAGE_KEY = "mindcontext.encryption.preferences.v1";

const DEFAULTS: EncryptionPreferences = {
  defaultCodec: "encrypt-selection",
};

export const ENCRYPTION_CODEC_OPTIONS: readonly {
  readonly id: EncryptionCodecId;
  readonly labelKey: string;
}[] = [
  { id: "encrypt-selection", labelKey: "encryption.codecs.encryptSelection" },
  { id: "meld", labelKey: "encryption.codecs.meld" },
  { id: "inline-encrypter", labelKey: "encryption.codecs.inlineEncrypter" },
  { id: "mindcontext", labelKey: "encryption.codecs.mindcontext" },
];

export function readEncryptionPreferences(): EncryptionPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const codec = parsed["defaultCodec"];
    return isEncryptionCodecId(codec)
      ? { defaultCodec: codec }
      : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function writeEncryptionPreferences(
  preferences: EncryptionPreferences,
): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function isEncryptionCodecId(
  value: unknown,
): value is EncryptionCodecId {
  return (
    value === "encrypt-selection" ||
    value === "inline-encrypter" ||
    value === "meld" ||
    value === "mindcontext"
  );
}
