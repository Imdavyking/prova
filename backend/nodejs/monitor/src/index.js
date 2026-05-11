"use strict";
// monitor/src/index.ts
//
// Prova Monitor — main entry point.
//
// Orchestration:
//   1. Load active rules from Solana registry
//   2. Subscribe to new rules as they're registered
//   3. Watch Ethereum for condition triggers
//   4. On trigger: generate SP1 ZK proof, submit to Solana, queue Arcium MXE
//
// Run: ts-node src/index.ts
//      (or: node dist/index.js in production)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@coral-xyz/anchor"));
const fs = __importStar(require("fs"));
const logger_1 = require("./logger");
const config_1 = require("./config");
const ethWatcher_1 = require("./ethWatcher");
const proofGenerator_1 = require("./proofGenerator");
const solanaSubmitter_1 = require("./solanaSubmitter");
const registryloader_1 = require("./registryloader");
async function main() {
    logger_1.logger.info("🚀 Prova Monitor starting...");
    logger_1.logger.info("Config", {
        solanaRpc: config_1.config.solanaRpcUrl,
        proverMode: config_1.config.proverMode,
        cluster: config_1.config.arciumCluster,
    });
    // ── Set up Anchor provider ───────────────────────────────────────────────
    const connection = new web3_js_1.Connection(config_1.config.solanaRpcUrl, "confirmed");
    const rawKp = JSON.parse(fs.readFileSync(config_1.config.monitorKeypairPath, "utf8"));
    const keypair = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(rawKp));
    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });
    anchor.setProvider(provider);
    logger_1.logger.info("Monitor keypair", { pubkey: keypair.publicKey.toBase58() });
    // ── Initialize components ────────────────────────────────────────────────
    const watcher = new ethWatcher_1.EthWatcher();
    const prover = new proofGenerator_1.ProofGenerator();
    const submitter = new solanaSubmitter_1.SolanaSubmitter();
    const loader = new registryloader_1.RegistryLoader(provider);
    // ── Load active rules and start watching ─────────────────────────────────
    const activeRules = await loader.loadActiveRules();
    activeRules.forEach((rule) => watcher.addRule(rule));
    // ── Subscribe to new rules registered on Solana ──────────────────────────
    loader.subscribeToNewRules((rule) => {
        logger_1.logger.info("Adding newly registered rule to watcher", {
            ruleId: rule.ruleId,
        });
        watcher.addRule(rule);
    });
    // ── Handle condition triggers ─────────────────────────────────────────────
    watcher.on("triggered", async (event) => {
        const { rule, blockNumber } = event;
        logger_1.logger.info("⚡ Processing trigger", {
            ruleId: rule.ruleId,
            block: blockNumber,
            balance: event.balance.toString(),
            threshold: rule.thresholdWei.toString(),
        });
        // Retry wrapper for the full prove + submit flow
        let attempts = 0;
        while (attempts < config_1.config.maxRetries) {
            try {
                // Step 1: Generate SP1 Groth16 proof
                const proof = await prover.generate(event);
                // Step 2: Submit proof + queue Arcium computation on Solana
                const finalizeSig = await submitter.submit(rule, proof);
                logger_1.logger.info("✅ Rule fully executed!", {
                    ruleId: rule.ruleId,
                    finalizeSig,
                });
                break;
            }
            catch (err) {
                attempts++;
                logger_1.logger.error("Execution attempt failed", {
                    attempt: attempts,
                    max: config_1.config.maxRetries,
                    ruleId: rule.ruleId,
                    error: String(err),
                });
                if (attempts >= config_1.config.maxRetries) {
                    logger_1.logger.error("❌ Max retries reached. Rule not executed.", {
                        ruleId: rule.ruleId,
                    });
                    // Re-add to watcher as fallback so it can be retried on next block
                    // In production: emit an alert here
                    watcher.addRule(rule);
                }
                else {
                    await sleep(config_1.config.retryDelayMs * attempts);
                }
            }
        }
    });
    // ── Start polling Ethereum ────────────────────────────────────────────────
    watcher.start();
    logger_1.logger.info("✓ Monitor running", {
        activeRules: activeRules.length,
        polling: `every ${config_1.config.ethPollIntervalMs / 1000}s`,
    });
    // ── Graceful shutdown ─────────────────────────────────────────────────────
    process.on("SIGINT", () => shutdown(watcher));
    process.on("SIGTERM", () => shutdown(watcher));
}
function shutdown(watcher) {
    logger_1.logger.info("Shutting down monitor...");
    watcher.stop();
    process.exit(0);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
main().catch((err) => {
    logger_1.logger.error("Fatal error", { error: String(err) });
    process.exit(1);
});
