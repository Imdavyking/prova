// sdk/src/registerRule.ts
//
// Builds and sends the register_rule instruction to prova_registry.
// Called by ProvaSDK.registerRule().

import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { ProvaSDK }          from "./ProvaSDK";
import type { RegisterRuleParams } from "./types";
import {
  SourceChain,
  ConditionType,
  ActionType,
} from "./types";

// ── Enum → Anchor discriminant maps ──────────────────────────────────────────
// Anchor serializes Rust enums as `{ EnumVariant: {} }` objects.

function toAnchorEnum(value: string): Record<string, Record<string, never>> {
  return { [value]: {} };
}

export async function registerRule(
  sdk:    ProvaSDK,
  params: RegisterRuleParams,
): Promise<{ txSig: string; ruleId: string; rulePda: string }> {
  const owner = sdk.provider.wallet.publicKey;

  // Generate a ruleId (use timestamp as nonce — deterministic per wallet+time)
  const nonce  = Date.now();
  const ruleId = sdk.generateRuleId(owner, nonce);
  const ruleIdBytes = Buffer.from(ruleId.replace("0x", ""), "hex");

  // Derive rule PDA
  const [rulePda, _bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("prova_rule"), owner.toBytes(), ruleIdBytes],
    sdk.registryProgram.programId
  );

  // Derive registry state PDA
  const [registryStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("prova_registry")],
    sdk.registryProgram.programId
  );

  // Pad ETH address hex to 20 bytes
  const watchAddressBytes  = hexTo20Bytes(params.watchAddress);
  const tokenAddressBytes  = hexTo20Bytes(params.tokenAddress);

  // Pad threshold to 32 bytes (u256 big-endian)
  const thresholdBytes = bigintTo32Bytes(BigInt(params.thresholdWei));

  // Build the params object matching RegisterRuleParams in Rust
  const registerParams = {
    ruleId:        Array.from(ruleIdBytes),
    sourceChain:   toAnchorEnum(params.sourceChain),
    conditionType: toAnchorEnum(params.conditionType),
    watchAddress:  Array.from(watchAddressBytes),
    tokenAddress:  Array.from(tokenAddressBytes),
    thresholdWei:  Array.from(thresholdBytes),
    actionType:    toAnchorEnum(params.actionType),
    recipient:     new PublicKey(params.recipient),
    tokenMint:     new PublicKey(params.tokenMint),
    actionAmount:  new anchor.BN(params.actionAmount),
    escrowedFee:   new anchor.BN(params.escrowedFeeLamports),
  };

  const txSig = await sdk.registryProgram.methods
    .registerRule(registerParams)
    .accounts({
      registryState: registryStatePda,
      rule:          rulePda,
      owner:         owner,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  return {
    txSig,
    ruleId,
    rulePda: rulePda.toBase58(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexTo20Bytes(hex: string): Uint8Array {
  const clean = hex.replace("0x", "").padStart(40, "0");
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

function bigintTo32Bytes(value: bigint): Uint8Array {
  const buf = Buffer.alloc(32, 0);
  let v = value;
  for (let i = 31; i >= 0 && v > 0n; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return Uint8Array.from(buf);
}