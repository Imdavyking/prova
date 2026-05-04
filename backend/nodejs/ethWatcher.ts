// monitor/src/ethWatcher.ts
//
// Watches Ethereum for registered Prova rule conditions.
// Polls eth_getBalance / eth_call for each active rule every block.
// Emits a "triggered" event when a condition is met.

import { ethers } from "ethers";
import { EventEmitter } from "events";
import { logger } from "./logger";
import { config } from "./config";

export interface ActiveRule {
  ruleId: string; // 32-byte hex
  owner: string; // Solana pubkey (base58)
  watchAddress: string; // 0x-prefixed ETH address
  tokenAddress: string; // 0x00...00 for native ETH
  thresholdWei: bigint;
  recipient: string; // Solana pubkey (base58)
  tokenMint: string; // Solana mint pubkey
  actionAmount: bigint;
}

export interface TriggerEvent {
  rule: ActiveRule;
  blockNumber: number;
  stateRoot: string;
  balance: bigint;
}

// Minimal ERC-20 ABI — just balanceOf
const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];

export class EthWatcher extends EventEmitter {
  private provider: ethers.JsonRpcProvider;
  private rules: Map<string, ActiveRule> = new Map();
  private polling: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.provider = new ethers.JsonRpcProvider(config.ethRpcUrl);
  }

  /** Add or update a rule to watch */
  addRule(rule: ActiveRule): void {
    this.rules.set(rule.ruleId, rule);
    logger.info("Watching rule", {
      ruleId: rule.ruleId,
      address: rule.watchAddress,
    });
  }

  /** Remove a rule (triggered or cancelled) */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    logger.info("Stopped watching rule", { ruleId });
  }

  /** Start the polling loop */
  start(): void {
    if (this.polling) return;
    this.polling = true;
    logger.info("ETH watcher started", { interval: config.ethPollIntervalMs });
    this.poll();
  }

  stop(): void {
    this.polling = false;
    if (this.timer) clearTimeout(this.timer);
    logger.info("ETH watcher stopped");
  }

  private async poll(): Promise<void> {
    if (!this.polling) return;

    try {
      const block = await this.provider.getBlock("latest");
      if (!block) throw new Error("Null block response");

      await this.checkAllRules(block.number, block.stateRoot ?? "");
    } catch (err) {
      logger.error("Poll error", { error: String(err) });
    }

    this.timer = setTimeout(() => this.poll(), config.ethPollIntervalMs);
  }

  private async checkAllRules(
    blockNumber: number,
    stateRoot: string,
  ): Promise<void> {
    const checks = Array.from(this.rules.values()).map((rule) =>
      this.checkRule(rule, blockNumber, stateRoot),
    );
    await Promise.allSettled(checks);
  }

  private async checkRule(
    rule: ActiveRule,
    blockNumber: number,
    stateRoot: string,
  ): Promise<void> {
    try {
      const balance = await this.getBalance(rule, blockNumber);

      logger.debug("Balance check", {
        ruleId: rule.ruleId,
        address: rule.watchAddress,
        balance: balance.toString(),
        threshold: rule.thresholdWei.toString(),
        block: blockNumber,
      });

      if (balance < rule.thresholdWei) {
        logger.info("🔔 Condition triggered!", {
          ruleId: rule.ruleId,
          balance: balance.toString(),
          threshold: rule.thresholdWei.toString(),
          block: blockNumber,
        });

        // Remove immediately so we don't double-trigger
        this.removeRule(rule.ruleId);

        const event: TriggerEvent = { rule, blockNumber, stateRoot, balance };
        this.emit("triggered", event);
      }
    } catch (err) {
      logger.warn("Rule check failed", {
        ruleId: rule.ruleId,
        error: String(err),
      });
    }
  }

  private async getBalance(
    rule: ActiveRule,
    blockNumber: number,
  ): Promise<bigint> {
    const tag = ethers.toQuantity(blockNumber);
    const isNative =
      rule.tokenAddress === "0x0000000000000000000000000000000000000000" ||
      rule.tokenAddress === "";

    if (isNative) {
      const balHex = await this.provider.send("eth_getBalance", [
        rule.watchAddress,
        tag,
      ]);
      return BigInt(balHex);
    } else {
      // ERC-20 balance
      const token = new ethers.Contract(
        rule.tokenAddress,
        ERC20_ABI,
        this.provider,
      );
      return BigInt(
        await token.balanceOf(rule.watchAddress, { blockTag: blockNumber }),
      );
    }
  }
}
