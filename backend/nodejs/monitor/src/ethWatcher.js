"use strict";
// monitor/src/ethWatcher.ts
//
// Watches Ethereum for registered Prova rule conditions.
// Polls eth_getBalance / eth_call for each active rule every block.
// Emits a "triggered" event when a condition is met.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthWatcher = void 0;
const ethers_1 = require("ethers");
const events_1 = require("events");
const logger_1 = require("./logger");
const config_1 = require("./config");
// Minimal ERC-20 ABI — just balanceOf
const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];
class EthWatcher extends events_1.EventEmitter {
    provider;
    rules = new Map();
    polling = false;
    timer = null;
    constructor() {
        super();
        this.provider = new ethers_1.ethers.JsonRpcProvider(config_1.config.ethRpcUrl);
    }
    /** Add or update a rule to watch */
    addRule(rule) {
        this.rules.set(rule.ruleId, rule);
        logger_1.logger.info("Watching rule", {
            ruleId: rule.ruleId,
            address: rule.watchAddress,
        });
    }
    /** Remove a rule (triggered or cancelled) */
    removeRule(ruleId) {
        this.rules.delete(ruleId);
        logger_1.logger.info("Stopped watching rule", { ruleId });
    }
    /** Start the polling loop */
    start() {
        if (this.polling)
            return;
        this.polling = true;
        logger_1.logger.info("ETH watcher started", { interval: config_1.config.ethPollIntervalMs });
        this.poll();
    }
    stop() {
        this.polling = false;
        if (this.timer)
            clearTimeout(this.timer);
        logger_1.logger.info("ETH watcher stopped");
    }
    async poll() {
        if (!this.polling)
            return;
        try {
            const block = await this.provider.getBlock("latest");
            if (!block)
                throw new Error("Null block response");
            await this.checkAllRules(block.number, block.stateRoot ?? "");
        }
        catch (err) {
            logger_1.logger.error("Poll error", { error: String(err) });
        }
        this.timer = setTimeout(() => this.poll(), config_1.config.ethPollIntervalMs);
    }
    async checkAllRules(blockNumber, stateRoot) {
        const checks = Array.from(this.rules.values()).map((rule) => this.checkRule(rule, blockNumber, stateRoot));
        await Promise.allSettled(checks);
    }
    async checkRule(rule, blockNumber, stateRoot) {
        try {
            const balance = await this.getBalance(rule, blockNumber);
            logger_1.logger.debug("Balance check", {
                ruleId: rule.ruleId,
                address: rule.watchAddress,
                balance: balance.toString(),
                threshold: rule.thresholdWei.toString(),
                block: blockNumber,
            });
            if (balance < rule.thresholdWei) {
                logger_1.logger.info("🔔 Condition triggered!", {
                    ruleId: rule.ruleId,
                    balance: balance.toString(),
                    threshold: rule.thresholdWei.toString(),
                    block: blockNumber,
                });
                // Remove immediately so we don't double-trigger
                this.removeRule(rule.ruleId);
                const event = { rule, blockNumber, stateRoot, balance };
                this.emit("triggered", event);
            }
        }
        catch (err) {
            logger_1.logger.warn("Rule check failed", {
                ruleId: rule.ruleId,
                error: String(err),
            });
        }
    }
    async getBalance(rule, blockNumber) {
        const tag = ethers_1.ethers.toQuantity(blockNumber);
        const isNative = rule.tokenAddress === "0x0000000000000000000000000000000000000000" ||
            rule.tokenAddress === "";
        if (isNative) {
            const balHex = await this.provider.send("eth_getBalance", [
                rule.watchAddress,
                tag,
            ]);
            return BigInt(balHex);
        }
        else {
            // ERC-20 balance
            const token = new ethers_1.ethers.Contract(rule.tokenAddress, ERC20_ABI, this.provider);
            return BigInt(await token.balanceOf(rule.watchAddress, { blockTag: blockNumber }));
        }
    }
}
exports.EthWatcher = EthWatcher;
