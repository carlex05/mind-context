import { describe, expect, it } from "vitest";

import {
  decryptEncryptedSource,
  encryptWithCodec,
  parseEncryptedBlock,
  transformEncryptionMarkdownSource,
} from "./plugins/encryptionCodecs";
import type { EncryptionCodecId } from "./plugins/encryptionPreferences";

const PASSPHRASE = "correct horse battery staple";

describe("encryption codecs", () => {
  for (const codecId of [
    "encrypt-selection",
    "meld",
    "inline-encrypter",
    "mindcontext",
  ] satisfies EncryptionCodecId[]) {
    it(`round-trips ${codecId}`, async () => {
      const plaintext = "Private context\nwith unicode: ñ 🌍";
      const serialized = await encryptWithCodec(
        codecId,
        plaintext,
        PASSPHRASE,
      );

      const transformed = transformEncryptionMarkdownSource(serialized);
      const match = transformed.match(
        /```([^\n]+)\n([\s\S]*?)\n```/,
      );
      expect(match).not.toBeNull();

      const encrypted = parseEncryptedBlock(match![1]!, match![2]!);
      expect(encrypted?.codecId).toBe(codecId);
      await expect(
        decryptEncryptedSource(encrypted!, PASSPHRASE),
      ).resolves.toBe(plaintext);
    });
  }

  it("serializes Encrypt Selection using its Obsidian aes256 fence", async () => {
    const serialized = await encryptWithCodec(
      "encrypt-selection",
      "secret",
      PASSPHRASE,
    );
    expect(serialized.startsWith("```aes256\n")).toBe(true);
  });

  it("serializes Meld using the current visible beta markers", async () => {
    const serialized = await encryptWithCodec("meld", "secret", PASSPHRASE);
    expect(serialized.startsWith("🔐β ")).toBe(true);
    expect(serialized.endsWith(" 🔐")).toBe(true);
  });

  it("recognizes Encrypt Selection inline tokens in Reading View", () => {
    const payload = "QUJDRA==";
    expect(
      transformEncryptionMarkdownSource(
        `before \`aes256:${payload}\` after`,
      ),
    ).toContain("```mindcontext-aes256-inline");
  });

  it("recognizes Inline Encrypter inline tokens in Reading View", () => {
    const payload = "QUJDRA==";
    expect(
      transformEncryptionMarkdownSource(
        `before \`secret ${payload}\` after`,
      ),
    ).toContain("```mindcontext-secret-inline");
  });

  it("recognizes current Meld visible and hidden markers", () => {
    const visible = transformEncryptionMarkdownSource(
      "before 🔐β QUJDRA== 🔐 after",
    );
    expect(visible).toContain("```mindcontext-meld");

    const hidden = transformEncryptionMarkdownSource(
      "before %%🔐β QUJDRA== 🔐%% after",
    );
    expect(hidden).toContain("```mindcontext-meld");
    expect(hidden.match(/```mindcontext-meld/g)).toHaveLength(1);
    expect(hidden).toContain("%%🔐β QUJDRA== 🔐%%");
  });

  it("rejects the wrong password for interoperable codecs", async () => {
    const serialized = await encryptWithCodec(
      "encrypt-selection",
      "secret",
      PASSPHRASE,
    );
    const body = serialized
      .replace(/^```aes256\n/, "")
      .replace(/\n```$/, "");
    const encrypted = parseEncryptedBlock("aes256", body);
    await expect(
      decryptEncryptedSource(encrypted!, "wrong password"),
    ).rejects.toThrow();
  });
});
