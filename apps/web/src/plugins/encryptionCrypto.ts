const FORMAT_VERSION = 1;
const ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AAD = new TextEncoder().encode("mindcontext-encrypted-v1");

export interface EncryptedPayloadV1 {
  readonly v: 1;
  readonly alg: "AES-GCM";
  readonly kdf: "PBKDF2-SHA256";
  readonly iterations: number;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

export async function encryptText(
  plaintext: string,
  passphrase: string,
): Promise<EncryptedPayloadV1> {
  if (!passphrase) throw new Error("Passphrase cannot be empty.");

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(AAD),
    },
    key,
    asArrayBuffer(new TextEncoder().encode(plaintext)),
  );

  return {
    v: FORMAT_VERSION,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptText(
  payload: EncryptedPayloadV1,
  passphrase: string,
): Promise<string> {
  validatePayload(payload);
  if (!passphrase) throw new Error("Passphrase cannot be empty.");

  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const key = await deriveKey(passphrase, salt, payload.iterations);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(AAD),
    },
    key,
    asArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export function serializeEncryptedBlock(payload: EncryptedPayloadV1): string {
  return `\`\`\`mindcontext-encrypted\n${JSON.stringify(payload)}\n\`\`\``;
}

export function parseEncryptedPayload(
  source: string,
): EncryptedPayloadV1 | undefined {
  try {
    const value = JSON.parse(source.trim()) as unknown;
    if (!isEncryptedPayload(value)) return undefined;
    validatePayload(value);
    return value;
  } catch {
    return undefined;
  }
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(new TextEncoder().encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asArrayBuffer(salt),
      iterations,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function validatePayload(payload: EncryptedPayloadV1): void {
  if (
    payload.v !== FORMAT_VERSION ||
    payload.alg !== "AES-GCM" ||
    payload.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(payload.iterations) ||
    payload.iterations < 100_000 ||
    payload.iterations > 2_000_000 ||
    fromBase64(payload.salt).length !== SALT_BYTES ||
    fromBase64(payload.iv).length !== IV_BYTES ||
    fromBase64(payload.ciphertext).length < 16
  ) {
    throw new Error("Unsupported encrypted block.");
  }
}

function isEncryptedPayload(value: unknown): value is EncryptedPayloadV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    item.v === 1 &&
    item.alg === "AES-GCM" &&
    item.kdf === "PBKDF2-SHA256" &&
    typeof item.iterations === "number" &&
    typeof item.salt === "string" &&
    typeof item.iv === "string" &&
    typeof item.ciphertext === "string"
  );
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
