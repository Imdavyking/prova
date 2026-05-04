// sdk/src/ruleStatus.ts
//
// Query functions for reading rule state from prova_registry.
// Called by ProvaSDK.getUserRules() and ProvaSDK.getRuleStatus().

import { PublicKey } from "@solana/web3.js";
import type { ProvaSDK } from "./ProvaSDK";
import {
  Rule,
  RuleStatus,
  SourceChain,
  ConditionType,
  ActionType,
} from "./types";

// ── Status map ────────────────────────────────────────────────────────────────
// Anchor returns Rust enums as objects: { Active: {} } | { Triggered: {} } etc.

function parseStatus(raw: Record<string, unknown>): RuleStatus {
  const key = Object.keys(raw)[0];
  const map: Record<string, RuleStatus> = {
    active: RuleStatus.Active,
    triggered: RuleStatus.Triggered,
    proving: RuleStatus.Proving,
    executed: RuleStatus.Executed,
    cancelled: RuleStatus.Cancelled,
  };
  return map[key.toLowerCase()] ?? RuleStatus.Active;
}

function parseEnum<T>(raw: Record<string, unknown>, fallback: T): T {
  const key = Object.keys(raw)[0];
  return (key as unknown as T) ?? fallback;
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

/**
 * Fetch all Rule accounts owned by a specific wallet.
 * Uses a memcmp filter on the `owner` field (offset 8 + 32 = 40 for rule_id, then owner at 8).
 */
export async function getUserRules(
  sdk: ProvaSDK,
  owner: PublicKey,
): Promise<Rule[]> {
  // owner field is at offset 8 (discriminator) in the Rule account
  const accounts = await sdk.registryProgram.account["rule"].all([
    {
      memcmp: {
        offset: 8, // after 8-byte discriminator
        bytes: owner.toBase58(),
      },
    },
  ]);

  return accounts
    .map((acc) => rawToRule(acc.publicKey, acc.account))
    .sort((a, b) => b.registeredAt - a.registeredAt); // newest first
}

/**
 * Fetch the current status of a single rule by PDA address.
 */
export async function getRuleStatus(
  sdk: ProvaSDK,
  rulePda: PublicKey,
): Promise<RuleStatus> {
  const data = await sdk.registryProgram.account["rule"].fetch(rulePda);
  return parseStatus((data as any).status);
}

/**
 * Fetch a single rule by PDA address.
 */
export async function getRule(
  sdk: ProvaSDK,
  rulePda: PublicKey,
): Promise<Rule> {
  const data = await sdk.registryProgram.account["rule"].fetch(rulePda);
  return rawToRule(rulePda, data);
}

/**
 * Poll a rule's status until it reaches Executed or Cancelled.
 * Useful for showing live progress in the frontend.
 *
 * @param onUpdate   - Called each time the status changes
 * @param intervalMs - How often to poll (default: 4000ms)
 * @param timeoutMs  - Give up after this long (default: 5 minutes)
 */
export async function pollUntilExecuted(
  sdk: ProvaSDK,
  rulePda: PublicKey,
  onUpdate: (status: RuleStatus) => void,
  intervalMs: number = 4_000,
  timeoutMs: number = 300_000,
): Promise<RuleStatus> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: RuleStatus | null = null;

  while (Date.now() < deadline) {
    const status = await getRuleStatus(sdk, rulePda);

    if (status !== lastStatus) {
      onUpdate(status);
      lastStatus = status;
    }

    if (status === RuleStatus.Executed || status === RuleStatus.Cancelled) {
      return status;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for rule ${rulePda.toBase58()} to execute`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
