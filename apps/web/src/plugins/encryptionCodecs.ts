import {
  decryptText as decryptMindContext,
  encryptText as encryptMindContext,
  parseEncryptedPayload,
  serializeEncryptedBlock,
} from "./encryptionCrypto";
import type { EncryptionCodecId } from "./encryptionPreferences";

export interface EncryptedSource {
  readonly codecId: EncryptionCodecId;
  readonly payload: string;
  readonly hint?: string;
  readonly meldVersion?: 0 | 1 | 2;
}

export const ENCRYPTION_BLOCK_LANGUAGES = [
  "mindcontext-encrypted",
  "aes256",
  "secret",
  "mindcontext-aes256-inline",
  "mindcontext-secret-inline",
  "mindcontext-meld",
] as const;

const ENCRYPT_SELECTION_ITERATIONS = 600_000;
const INLINE_ENCRYPTER_ITERATIONS = 262_144;
const MELD_ITERATIONS = 210_000;
const MELD_ALPHA_ITERATIONS = 1_000;
const MELD_ALPHA_SALT = new TextEncoder().encode("XHWnDAT6ehMVY2zD");
const MELD_OBSOLETE_IV = new Uint8Array([
  196, 190, 240, 190, 188, 78, 41, 132, 15, 220, 84, 211,
]);

export async function encryptWithCodec(
  codecId: EncryptionCodecId,
  plaintext: string,
  passphrase: string,
): Promise<string> {
  if (codecId === "mindcontext") {
    return serializeEncryptedBlock(
      await encryptMindContext(plaintext, passphrase),
    );
  }

  if (codecId === "encrypt-selection") {
    const payload = await encryptEncryptSelection(plaintext, passphrase);
    return `\`\`\`aes256\n${wrapBase64(toBase64(payload))}\n\`\`\``;
  }

  if (codecId === "inline-encrypter") {
    const payload = await encryptIvSaltGcm(
      plaintext,
      passphrase,
      INLINE_ENCRYPTER_ITERATIONS,
      "SHA-512",
    );
    return `\`\`\`secret\n${toBase64(payload)}\n\`\`\``;
  }

  const payload = await encryptIvSaltGcm(
    plaintext,
    passphrase,
    MELD_ITERATIONS,
    "SHA-512",
  );
  return `🔐β ${toBase64(payload)} 🔐`;
}

export function parseEncryptedBlock(
  language: string,
  source: string,
): EncryptedSource | undefined {
  const normalized = language.trim().toLocaleLowerCase();
  const payload = source.trim();

  if (normalized === "mindcontext-encrypted") {
    return parseEncryptedPayload(payload)
      ? { codecId: "mindcontext", payload }
      : undefined;
  }

  if (
    normalized === "aes256" ||
    normalized === "mindcontext-aes256-inline"
  ) {
    const base64 = payload.replace(/\s+/g, "");
    return isBase64(base64)
      ? { codecId: "encrypt-selection", payload: base64 }
      : undefined;
  }

  if (
    normalized === "secret" ||
    normalized === "mindcontext-secret-inline"
  ) {
    const base64 = payload.replace(/\s+/g, "");
    return isBase64(base64)
      ? { codecId: "inline-encrypter", payload: base64 }
      : undefined;
  }

  if (normalized === "mindcontext-meld") {
    return parseMeldMarker(payload);
  }

  return undefined;
}

export async function decryptEncryptedSource(
  source: EncryptedSource,
  passphrase: string,
): Promise<string> {
  if (source.codecId === "mindcontext") {
    const payload = parseEncryptedPayload(source.payload);
    if (!payload) throw new Error("Invalid MindContext encrypted payload.");
    return decryptMindContext(payload, passphrase);
  }

  if (source.codecId === "encrypt-selection") {
    return decryptEncryptSelection(fromBase64(source.payload), passphrase);
  }

  if (source.codecId === "inline-encrypter") {
    return decryptIvSaltGcm(
      fromBase64(source.payload),
      passphrase,
      INLINE_ENCRYPTER_ITERATIONS,
      "SHA-512",
    );
  }

  const version = source.meldVersion ?? 2;
  if (version === 2) {
    return decryptIvSaltGcm(
      fromBase64(source.payload),
      passphrase,
      MELD_ITERATIONS,
      "SHA-512",
    );
  }
  if (version === 1) {
    return decryptMeldAlpha(fromBase64(source.payload), passphrase);
  }
  return decryptMeldObsolete(fromBase64(source.payload), passphrase);
}

export function transformEncryptionMarkdownSource(markdown: string): string {
  let result = markdown.replace(
    /`aes256:([A-Za-z0-9+/=]+)`/g,
    (_match, payload: string) =>
      `\n\n\`\`\`mindcontext-aes256-inline\n${payload}\n\`\`\`\n\n`,
  );

  result = result.replace(
    /`secret\s+([A-Za-z0-9+/=]+)`/g,
    (_match, payload: string) =>
      `\n\n\`\`\`mindcontext-secret-inline\n${payload}\n\`\`\`\n\n`,
  );

  const meldMarker =
    /%%🔐(?:β|α)?\s+(?:💡[^💡\n]*💡)?[A-Za-z0-9+/=]+\s+🔐%%|🔐(?:β|α)?\s+(?:💡[^💡\n]*💡)?[A-Za-z0-9+/=]+\s+🔐/g;
  result = result.replace(
    meldMarker,
    (marker) =>
      `\n\n\`\`\`mindcontext-meld\n${marker}\n\`\`\`\n\n`,
  );

  return result;
}

export function codecDisplayName(codecId: EncryptionCodecId): string {
  if (codecId === "encrypt-selection") return "Encrypt Selection";
  if (codecId === "inline-encrypter") return "Inline Encrypter";
  if (codecId === "meld") return "Meld Encrypt";
  return "MindContext";
}

async function encryptEncryptSelection(
  plaintext: string,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const hint = new Uint8Array(0);
  const header = new Uint8Array(9 + 1 + salt.length + 1 + iv.length + 2);
  const view = new DataView(header.buffer);
  let offset = 0;
  header[offset++] = 0xae;
  header[offset++] = 0x52;
  header[offset++] = 0x01;
  header[offset++] = 0x01;
  header[offset++] = 0x01;
  view.setUint32(offset, ENCRYPT_SELECTION_ITERATIONS, false);
  offset += 4;
  header[offset++] = salt.length;
  header.set(salt, offset);
  offset += salt.length;
  header[offset++] = iv.length;
  header.set(iv, offset);
  offset += iv.length;
  view.setUint16(offset, hint.length, false);

  const key = await deriveAesKey(
    passphrase,
    salt,
    ENCRYPT_SELECTION_ITERATIONS,
    "SHA-256",
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(iv),
        additionalData: asArrayBuffer(header),
        tagLength: 128,
      },
      key,
      asArrayBuffer(new TextEncoder().encode(plaintext)),
    ),
  );
  return concatBytes(header, ciphertext);
}

async function decryptEncryptSelection(
  payload: Uint8Array,
  passphrase: string,
): Promise<string> {
  if (
    payload.length < 9 ||
    payload[0] !== 0xae ||
    payload[1] !== 0x52 ||
    payload[2] !== 0x01 ||
    payload[3] !== 0x01 ||
    payload[4] !== 0x01
  ) {
    throw new Error("Unsupported Encrypt Selection payload.");
  }

  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const iterations = view.getUint32(5, false);
  let offset = 9;

  const saltLength = payload[offset++];
  if (!saltLength || payload.length < offset + saltLength + 1) {
    throw new Error("Invalid Encrypt Selection salt.");
  }
  const salt = payload.slice(offset, offset + saltLength);
  offset += saltLength;

  const ivLength = payload[offset++];
  if (!ivLength || payload.length < offset + ivLength + 2) {
    throw new Error("Invalid Encrypt Selection IV.");
  }
  const iv = payload.slice(offset, offset + ivLength);
  offset += ivLength;

  const hintLength = view.getUint16(offset, false);
  offset += 2;
  if (payload.length < offset + hintLength + 16) {
    throw new Error("Invalid Encrypt Selection payload.");
  }
  offset += hintLength;

  const header = payload.slice(0, offset);
  const ciphertext = payload.slice(offset);
  const key = await deriveAesKey(
    passphrase,
    salt,
    iterations,
    "SHA-256",
  );
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(header),
      tagLength: 128,
    },
    key,
    asArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

async function encryptIvSaltGcm(
  plaintext: string,
  passphrase: string,
  iterations: number,
  hash: "SHA-256" | "SHA-512",
): Promise<Uint8Array> {
  const iv = randomBytes(16);
  const salt = randomBytes(16);
  const key = await deriveAesKey(passphrase, salt, iterations, hash);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(iv) },
      key,
      asArrayBuffer(new TextEncoder().encode(plaintext)),
    ),
  );
  return concatBytes(concatBytes(iv, salt), ciphertext);
}

async function decryptIvSaltGcm(
  payload: Uint8Array,
  passphrase: string,
  iterations: number,
  hash: "SHA-256" | "SHA-512",
): Promise<string> {
  if (payload.length < 48) throw new Error("Encrypted payload is too short.");
  const iv = payload.slice(0, 16);
  const salt = payload.slice(16, 32);
  const ciphertext = payload.slice(32);
  const key = await deriveAesKey(passphrase, salt, iterations, hash);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

async function decryptMeldAlpha(
  payload: Uint8Array,
  passphrase: string,
): Promise<string> {
  if (payload.length < 32) throw new Error("Meld alpha payload is too short.");
  const iv = payload.slice(0, 16);
  const ciphertext = payload.slice(16);
  const key = await deriveAesKey(
    passphrase,
    MELD_ALPHA_SALT,
    MELD_ALPHA_ITERATIONS,
    "SHA-256",
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

async function decryptMeldObsolete(
  payload: Uint8Array,
  passphrase: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    asArrayBuffer(new TextEncoder().encode(passphrase)),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(MELD_OBSOLETE_IV),
      tagLength: 128,
    },
    key,
    asArrayBuffer(payload),
  );
  return new TextDecoder().decode(decrypted);
}

function parseMeldMarker(value: string): EncryptedSource | undefined {
  let text = value.trim();
  let version: 0 | 1 | 2;

  if (text.startsWith("%%🔐β ")) {
    version = 2;
    text = text.slice("%%🔐β ".length);
  } else if (text.startsWith("🔐β ")) {
    version = 2;
    text = text.slice("🔐β ".length);
  } else if (text.startsWith("%%🔐α ")) {
    version = 1;
    text = text.slice("%%🔐α ".length);
  } else if (text.startsWith("🔐α ")) {
    version = 1;
    text = text.slice("🔐α ".length);
  } else if (text.startsWith("%%🔐 ")) {
    version = 0;
    text = text.slice("%%🔐 ".length);
  } else if (text.startsWith("🔐 ")) {
    version = 0;
    text = text.slice("🔐 ".length);
  } else {
    return undefined;
  }

  if (text.endsWith(" 🔐%%")) text = text.slice(0, -" 🔐%%".length);
  else if (text.endsWith(" 🔐")) text = text.slice(0, -" 🔐".length);
  else return undefined;

  let hint: string | undefined;
  if (text.startsWith("💡")) {
    const end = text.indexOf("💡", "💡".length);
    if (end < 0) return undefined;
    hint = text.slice("💡".length, end);
    text = text.slice(end + "💡".length);
  }

  const payload = text.trim();
  if (!isBase64(payload)) return undefined;
  return {
    codecId: "meld",
    payload,
    meldVersion: version,
    ...(hint ? { hint } : {}),
  };
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  hash: "SHA-256" | "SHA-512",
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(new TextEncoder().encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash,
      salt: asArrayBuffer(salt),
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomBytes(size: number): Uint8Array {
  const value = new Uint8Array(size);
  crypto.getRandomValues(value);
  return value;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const value = new Uint8Array(left.length + right.length);
  value.set(left, 0);
  value.set(right, left.length);
  return value;
}

function wrapBase64(value: string): string {
  const lines: string[] = [];
  for (let offset = 0; offset < value.length; offset += 64) {
    lines.push(value.slice(offset, offset + 64));
  }
  return lines.join("\n");
}

function isBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  if (!isBase64(normalized)) throw new Error("Invalid base64 payload.");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
