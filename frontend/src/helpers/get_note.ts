import { decryptNote } from "./encrypt";

const STORACHA_GATEWAY =
  import.meta.env.VITE_STORACHA_GATEWAY ?? "https://storacha.link";

export interface NoteData {
  nullifier: string;
  secret: string;
  commitment: string;
}

export async function getNoteFromCid(
  account: any,
  cid: string,
): Promise<NoteData> {
  const res = await fetch(`${STORACHA_GATEWAY}/ipfs/${cid.trim()}`);
  if (!res.ok) throw new Error(`IPFS gateway error: ${res.status}`);

  const json = await res.json();
  if (!json.encrypted)
    throw new Error("Invalid IPFS payload — missing encrypted field");

  return decryptNote(account, json.encrypted);
}
