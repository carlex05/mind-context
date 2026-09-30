import { describe, expect, it } from "vitest";

import {
  decryptText,
  encryptText,
  parseEncryptedPayload,
  serializeEncryptedBlock,
} from "./plugins/encryptionCrypto";

describe("encryptionCrypto", () => {
  it("round-trips encrypted text without storing plaintext in the payload", async () => {
    const plaintext = "Secret line\\nwith more context.";
    const payload = await encryptText(plaintext, "correct horse battery staple");

    expect(JSON.stringify(payload)).not.toContain(plaintext);
    expect(
      await decryptText(payload, "correct horse battery staple"),
    ).toBe(plaintext);

    const block = serializeEncryptedBlock(payload);
    expect(block).toContain("```mindcontext-encrypted");
    const encoded = block
      .replace(/^```mindcontext-encrypted\\n/, "")
      .replace(/\\n```$/, "");
    expect(parseEncryptedPayload(encoded)).toEqual(payload);
  });

  it("rejects a wrong passphrase", async () => {
    const payload = await encryptText("classified", "right-passphrase");
    await expect(decryptText(payload, "wrong-passphrase")).rejects.toThrow();
  });
});
