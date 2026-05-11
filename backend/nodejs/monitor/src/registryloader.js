"use strict";
// monitor/src/registryLoader.ts
//
// Loads active rules from the prova_registry Solana program
// and feeds them into the EthWatcher.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistryLoader = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@coral-xyz/anchor"));
const logger_1 = require("./logger");
const config_1 = require("./config");
const prova_registry_json_1 = __importDefault(require("../../target/idl/prova_registry.json"));
const RULE_SEED = Buffer.from("prova_rule");
const REGISTRY_SEED = Buffer.from("prova_registry");
// Status discriminant values (must match the Rust enum order)
const STATUS_ACTIVE = 0;
class RegistryLoader {
    program;
    constructor(provider) {
        this.program = new anchor.Program(prova_registry_json_1.default, new web3_js_1.PublicKey(config_1.config.registryProgramId), provider);
    }
    /** Fetch all Rule accounts with status == Active */
    async loadActiveRules() {
        logger_1.logger.info("Loading active rules from registry...");
        try {
            // Fetch all Rule accounts — filter by status byte (offset 8 + 32 + 32 + ... = status position)
            // Anchor provides getProgramAccounts with filter support
            const accounts = await this.program.account["rule"].all([
                {
                    // status field is at a known offset in the Rule account
                    // Status::Active = 0 (first enum variant)
                    memcmp: {
                        offset: getRuleStatusOffset(),
                        bytes: "1", // base58 encoded [0] = "1" in bs58
                    },
                },
            ]);
            const rules = accounts.map((acc) => {
                const data = acc.account;
                return {
                    ruleId: "0x" + Buffer.from(data.ruleId).toString("hex"),
                    owner: data.owner.toBase58(),
                    watchAddress: "0x" + Buffer.from(data.watchAddress).toString("hex"),
                    tokenAddress: "0x" + Buffer.from(data.tokenAddress).toString("hex"),
                    thresholdWei: bufferToBigInt(Buffer.from(data.thresholdWei)),
                    recipient: data.recipient.toBase58(),
                    tokenMint: data.tokenMint.toBase58(),
                    actionAmount: BigInt(data.actionAmount.toString()),
                };
            });
            logger_1.logger.info(`Loaded ${rules.length} active rules`);
            return rules;
        }
        catch (err) {
            logger_1.logger.error("Failed to load rules", { error: String(err) });
            return [];
        }
    }
    /** Subscribe to RuleRegistered events and add new rules dynamically */
    subscribeToNewRules(onNewRule) {
        this.program.addEventListener("ruleRegistered", (event) => {
            logger_1.logger.info("New rule registered", {
                ruleId: Buffer.from(event.ruleId).toString("hex"),
            });
            const rule = {
                ruleId: "0x" + Buffer.from(event.ruleId).toString("hex"),
                owner: event.owner.toBase58(),
                watchAddress: "0x" + Buffer.from(event.watchAddress).toString("hex"),
                tokenAddress: "0x0000000000000000000000000000000000000000",
                thresholdWei: bufferToBigInt(Buffer.from(event.thresholdWei)),
                recipient: event.recipient.toBase58(),
                tokenMint: event.tokenMint?.toBase58() ?? "",
                actionAmount: BigInt(event.actionAmount.toString()),
            };
            onNewRule(rule);
        });
    }
}
exports.RegistryLoader = RegistryLoader;
/** Calculate byte offset of the `status` field in the Rule account */
function getRuleStatusOffset() {
    // 8 (discriminator) + 32 (owner) + 32 (rule_id) + 2 (source_chain)
    // + 2 (condition_type) + 20 (watch_address) + 20 (token_address)
    // + 32 (threshold_wei) + 2 (action_type) + 32 (recipient) + 32 (token_mint)
    // + 8 (action_amount) + 8 (escrowed_fee) = 230
    return 230;
}
function bufferToBigInt(buf) {
    return BigInt("0x" + (buf.toString("hex") || "00"));
}
