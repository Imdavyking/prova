import { AccountInterface, type ArraySignatureType } from "starknet";
import { type WeierstrassSignatureType } from "starknet";
const TYPED_DATA = {
  domain: {
    name: "Umbra",
    version: "1",
    chainId: "SN_SEPOLIA",
    revision: "1",
  },
  types: {
    StarknetDomain: [
      { name: "name", type: "shortstring" },
      { name: "version", type: "shortstring" },
      { name: "chainId", type: "shortstring" },
      { name: "revision", type: "shortstring" },
    ],
    Message: [{ name: "action", type: "shortstring" }],
  },
  primaryType: "Message",
  message: { action: "decrypt_note" },
};

function extractKeyMaterial(
  signature: ArraySignatureType | WeierstrassSignatureType,
): string {
  if (Array.isArray(signature)) {
    // ArraySignatureType: ["0x...", "0x..."]
    return signature[0].slice(2).padStart(64, "0");
  } else {
    // WeierstrassSignatureType: { r: bigint, s: bigint }
    return signature.r.toString(16).padStart(64, "0");
  }
}
async function deriveKey(
  account: AccountInterface,
  usage: "encrypt" | "decrypt",
) {
  const signature = await account.signMessage(TYPED_DATA);
  const rawKey = extractKeyMaterial(signature);

  return crypto.subtle.importKey(
    "raw",
    Buffer.from(rawKey, "hex"),
    "AES-GCM",
    false,
    [usage],
  );
}

export async function encryptNote(
  account: AccountInterface,
  note: { nullifier: string; secret: string; commitment: string },
): Promise<string> {
  const cryptoKey = await deriveKey(account, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(JSON.stringify(note)),
  );
  return JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  });
}

export async function decryptNote(
  account: AccountInterface,
  encrypted: string,
): Promise<{ nullifier: string; secret: string; commitment: string }> {
  const cryptoKey = await deriveKey(account, "decrypt");
  const { iv, data } = JSON.parse(encrypted);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    cryptoKey,
    new Uint8Array(data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
