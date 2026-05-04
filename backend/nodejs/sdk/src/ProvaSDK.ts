// sdk/src/ProvaSDK.ts
//
// Main SDK class. Instantiate with a wallet adapter and connection,
// then call methods to interact with the prova_registry program.

import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { RegisterRuleParams, Rule, RuleStatus, ProvaSDKConfig } from "./types";
import { registerRule } from "./registerRule";
import { getUserRules, getRuleStatus } from "./ruleStatus";

// IDL — copy from target/idl/ after `arcium build`
import RegistryIDL from "../../target/idl/prova_registry.json";

const DEFAULT_CONFIG: ProvaSDKConfig = {
  registryProgramId: process.env["NEXT_PUBLIC_REGISTRY_PROGRAM_ID"] ?? "",
  executorProgramId: process.env["NEXT_PUBLIC_EXECUTOR_PROGRAM_ID"] ?? "",
  cluster: "devnet",
};

export class ProvaSDK {
  public readonly provider: anchor.AnchorProvider;
  public readonly registryProgram: anchor.Program;
  public readonly connection: Connection;
  private readonly config: ProvaSDKConfig;

  /**
   * @param wallet    - Any wallet adapter that implements `anchor.Wallet`
   *                    (e.g. from @solana/wallet-adapter-react via `useAnchorWallet()`)
   * @param connection - Solana connection
   * @param config    - Optional: override program IDs or cluster
   */
  constructor(
    wallet: anchor.Wallet,
    connection: Connection,
    config: Partial<ProvaSDKConfig> = {},
  ) {
    this.connection = connection;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    anchor.setProvider(this.provider);

    this.registryProgram = new anchor.Program(
      RegistryIDL as anchor.Idl,
      new PublicKey(this.config.registryProgramId),
      this.provider,
    );
  }

  // ── Rule registration ─────────────────────────────────────────────────────

  /**
   * Register a new cross-chain rule on Solana.
   * Escrows the execution fee in the rule PDA.
   *
   * @returns { txSig, ruleId, rulePda }
   */
  async registerRule(params: RegisterRuleParams): Promise<{
    txSig: string;
    ruleId: string; // 0x-prefixed 32-byte hex
    rulePda: string; // base58
  }> {
    return registerRule(this, params);
  }

  // ── Rule queries ──────────────────────────────────────────────────────────

  /**
   * Fetch all rules for a given owner pubkey.
   */
  async getUserRules(owner: PublicKey): Promise<Rule[]> {
    return getUserRules(this, owner);
  }

  /**
   * Fetch the current status of a single rule by its PDA address.
   */
  async getRuleStatus(rulePda: PublicKey): Promise<RuleStatus> {
    return getRuleStatus(this, rulePda);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Derive the rule PDA from owner pubkey + ruleId bytes.
   */
  deriveRulePda(owner: PublicKey, ruleIdHex: string): PublicKey {
    const ruleIdBytes = Buffer.from(ruleIdHex.replace("0x", ""), "hex");
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("prova_rule"), owner.toBytes(), ruleIdBytes],
      this.registryProgram.programId,
    );
    return pda;
  }

  /**
   * Generate a deterministic ruleId from owner pubkey + nonce.
   * Mirrors the off-chain monitor's rule_id generation.
   */
  generateRuleId(owner: PublicKey, nonce: number): string {
    // keccak256(owner_bytes ++ nonce_le_u64) — done with a simple hash here
    // In production use @ethersproject/keccak256 or ethers.keccak256
    const buf = Buffer.alloc(40);
    owner.toBytes().forEach((b, i) => buf.writeUInt8(b, i));
    buf.writeBigUInt64LE(BigInt(nonce), 32);
    // Simple non-crypto hash for demo — replace with actual keccak256
    const hash = Array.from(buf).reduce((acc, b, i) => {
      acc[i % 32] ^= b;
      return acc;
    }, new Uint8Array(32));
    return "0x" + Buffer.from(hash).toString("hex");
  }

  /**
   * Subscribe to RuleRegistered events from the registry.
   * @returns unsubscribe function
   */
  onRuleRegistered(
    callback: (event: {
      ruleId: string;
      owner: string;
      actionAmount: string;
    }) => void,
  ): () => void {
    const listenerId = this.registryProgram.addEventListener(
      "ruleRegistered",
      (event: any) => {
        callback({
          ruleId: "0x" + Buffer.from(event.ruleId).toString("hex"),
          owner: event.owner.toBase58(),
          actionAmount: event.actionAmount.toString(),
        });
      },
    );
    return () => {
      this.registryProgram.removeEventListener(listenerId);
    };
  }

  /**
   * Subscribe to RuleExecuted events.
   * Use this in your frontend to show the user when their rule fires.
   */
  onRuleExecuted(
    callback: (event: {
      ruleId: string;
      executedAt: number;
      txSignature: string;
    }) => void,
  ): () => void {
    const listenerId = this.registryProgram.addEventListener(
      "ruleExecuted",
      (event: any) => {
        callback({
          ruleId: "0x" + Buffer.from(event.ruleId).toString("hex"),
          executedAt: event.executedAt.toNumber(),
          txSignature: Buffer.from(event.txSignature).toString("hex"),
        });
      },
    );
    return () => this.registryProgram.removeEventListener(listenerId);
  }
}
