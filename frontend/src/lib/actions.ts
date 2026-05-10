// src/lib/actions.ts
//
// Self-contained wrappers around the prova_registry Anchor program.
// Does not import from backend/nodejs/sdk (different node_modules).
// IDL must be copied to: src/assets/json/prova_registry.json
//   cp backend/prova/target/idl/prova_registry.json frontend/src/assets/json/

import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { REGISTRY_PROGRAM_ID, MIN_FEE_LAMPORTS } from "../utils/constants";
import RegistryIDL from "../assets/json/prova_registry.json";

// ── Types (mirrors backend/nodejs/sdk/src/types.ts) ──────────────────────────

export enum SourceChain {
  Ethereum = "Ethereum",
  Base = "Base",
  Arbitrum = "Arbitrum",
  Optimism = "Optimism",
  Polygon = "Polygon",
}

export enum ConditionType {
  BalanceBelow = "BalanceBelow",
  TokenBalanceBelow = "TokenBalanceBelow",
  BlockReached = "BlockReached",
  StorageSlotEquals = "StorageSlotEquals",
}

export enum ActionType {
  TransferSpl = "TransferSpl",
  TransferSol = "TransferSol",
}

export enum RuleStatus {
  Active = "Active",
  Triggered = "Triggered",
  Proving = "Proving",
  Executed = "Executed",
  Cancelled = "Cancelled",
}

export interface RegisterRuleParams {
  sourceChain: SourceChain;
  conditionType: ConditionType;
  watchAddress: string; // 0x-prefixed ETH address
  tokenAddress: string; // 0x00...00 for native ETH
  thresholdWei: string; // decimal string (e.g. "500000000000000000" for 0.5 ETH)
  actionType: ActionType;
  recipient: string; // Solana pubkey base58
  tokenMint: string; // SPL mint pubkey base58
  actionAmount: string; // token smallest unit
  escrowedFeeLamports: number;
}

export interface Rule {
  address: string;
  ruleId: string;
  owner: string;
  sourceChain: SourceChain;
  conditionType: ConditionType;
  watchAddress: string;
  tokenAddress: string;
  thresholdWei: string;
  actionType: ActionType;
  recipient: string;
  tokenMint: string;
  actionAmount: string;
  escrowedFee: string;
  status: RuleStatus;
  registeredAt: number;
  executedAt: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeProgram(
  wallet: AnchorWallet,
  connection: Connection,
): anchor.Program {
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  return new anchor.Program(
    RegistryIDL as anchor.Idl,
    new PublicKey(REGISTRY_PROGRAM_ID),
    provider,
  );
}

function toAnchorEnum(value: string): Record<string, Record<string, never>> {
  return { [value]: {} };
}

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

function parseStatus(raw: Record<string, unknown>): RuleStatus {
  const key = Object.keys(raw)[0].toLowerCase();
  const map: Record<string, RuleStatus> = {
    active: RuleStatus.Active,
    triggered: RuleStatus.Triggered,
    proving: RuleStatus.Proving,
    executed: RuleStatus.Executed,
    cancelled: RuleStatus.Cancelled,
  };
  return map[key] ?? RuleStatus.Active;
}

function parseEnum<T>(raw: Record<string, unknown>, fallback: T): T {
  return (Object.keys(raw)[0] as unknown as T) ?? fallback;
}

function rawToRule(address: PublicKey, data: any): Rule {
  return {
    address: address.toBase58(),
    ruleId: "0x" + Buffer.from(data.ruleId).toString("hex"),
    owner: data.owner.toBase58(),
    sourceChain: parseEnum<SourceChain>(data.sourceChain, SourceChain.Ethereum),
    conditionType: parseEnum<ConditionType>(
      data.conditionType,
      ConditionType.BalanceBelow,
    ),
    watchAddress: "0x" + Buffer.from(data.watchAddress).toString("hex"),
    tokenAddress: "0x" + Buffer.from(data.tokenAddress).toString("hex"),
    thresholdWei: BigInt(
      "0x" + Buffer.from(data.thresholdWei).toString("hex"),
    ).toString(),
    actionType: parseEnum<ActionType>(data.actionType, ActionType.TransferSpl),
    recipient: data.recipient.toBase58(),
    tokenMint: data.tokenMint.toBase58(),
    actionAmount: data.actionAmount.toString(),
    escrowedFee: data.escrowedFee.toString(),
    status: parseStatus(data.status),
    registeredAt: data.registeredAt.toNumber(),
    executedAt: data.executedAt.toNumber(),
  };
}

function generateRuleId(owner: PublicKey, nonce: number): string {
  // Simple unique ID — replace with ethers.keccak256 before mainnet
  const buf = Buffer.alloc(40);
  owner.toBytes().forEach((b, i) => buf.writeUInt8(b, i));
  buf.writeBigUInt64LE(BigInt(nonce), 32);
  const hash = Array.from(buf).reduce((acc, b, i) => {
    acc[i % 32] ^= b;
    return acc;
  }, new Uint8Array(32));
  return "0x" + Buffer.from(hash).toString("hex");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function registerRule(
  wallet: AnchorWallet,
  connection: Connection,
  params: RegisterRuleParams,
): Promise<{ txSig: string; ruleId: string; rulePda: string }> {
  const program = makeProgram(wallet, connection);
  const owner = wallet.publicKey;

  const ruleId = generateRuleId(owner, Date.now());
  const ruleIdBytes = Buffer.from(ruleId.replace("0x", ""), "hex");

  const [rulePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("prova_rule"), owner.toBytes(), ruleIdBytes],
    program.programId,
  );
  const [registryStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("prova_registry")],
    program.programId,
  );

  const txSig = await (program.methods as any)
    .registerRule({
      ruleId: Array.from(ruleIdBytes),
      sourceChain: toAnchorEnum(params.sourceChain),
      conditionType: toAnchorEnum(params.conditionType),
      watchAddress: Array.from(hexTo20Bytes(params.watchAddress)),
      tokenAddress: Array.from(hexTo20Bytes(params.tokenAddress)),
      thresholdWei: Array.from(bigintTo32Bytes(BigInt(params.thresholdWei))),
      actionType: toAnchorEnum(params.actionType),
      recipient: new PublicKey(params.recipient),
      tokenMint: new PublicKey(params.tokenMint),
      actionAmount: new anchor.BN(params.actionAmount),
      escrowedFee: new anchor.BN(params.escrowedFeeLamports),
    })
    .accounts({
      registryState: registryStatePda,
      rule: rulePda,
      owner,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  return { txSig, ruleId, rulePda: rulePda.toBase58() };
}

export async function getUserRules(
  wallet: AnchorWallet,
  connection: Connection,
  owner?: PublicKey,
): Promise<Rule[]> {
  const program = makeProgram(wallet, connection);
  const ownerKey = owner ?? wallet.publicKey;

  const accounts = await (program.account as any)["rule"].all([
    {
      memcmp: {
        offset: 8, // after 8-byte discriminator
        bytes: ownerKey.toBase58(),
      },
    },
  ]);

  return accounts
    .map((acc: any) => rawToRule(acc.publicKey, acc.account))
    .sort((a: Rule, b: Rule) => b.registeredAt - a.registeredAt);
}

export async function cancelRule(
  wallet: AnchorWallet,
  connection: Connection,
  rulePdaStr: string,
): Promise<string> {
  const program = makeProgram(wallet, connection);
  const rulePda = new PublicKey(rulePdaStr);

  const [registryStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("prova_registry")],
    program.programId,
  );

  return (program.methods as any)
    .cancelRule()
    .accounts({
      registryState: registryStatePda,
      rule: rulePda,
      owner: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });
}

export async function pollRuleStatus(
  wallet: AnchorWallet,
  connection: Connection,
  rulePdaStr: string,
  onUpdate: (status: RuleStatus) => void,
  intervalMs = 4_000,
  timeoutMs = 300_000,
): Promise<RuleStatus> {
  const program = makeProgram(wallet, connection);
  const rulePda = new PublicKey(rulePdaStr);
  const deadline = Date.now() + timeoutMs;
  let last: RuleStatus | null = null;

  while (Date.now() < deadline) {
    const data = await (program.account as any)["rule"].fetch(rulePda);
    const status = parseStatus(data.status);
    if (status !== last) {
      onUpdate(status);
      last = status;
    }
    if (status === RuleStatus.Executed || status === RuleStatus.Cancelled) {
      return status;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for rule to execute");
}
