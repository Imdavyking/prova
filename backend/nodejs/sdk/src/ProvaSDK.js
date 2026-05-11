"use strict";
// sdk/src/ProvaSDK.ts
//
// Main SDK class. Instantiate with a wallet adapter and connection,
// then call methods to interact with the prova_registry program.
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvaSDK = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@coral-xyz/anchor"));
const registerRule_1 = require("./registerRule");
const ruleStatus_1 = require("./ruleStatus");
// IDL — copy from target/idl/ after `arcium build`
const prova_registry_json_1 = __importDefault(require("../../target/idl/prova_registry.json"));
const DEFAULT_CONFIG = {
    registryProgramId: (_a = process.env["NEXT_PUBLIC_REGISTRY_PROGRAM_ID"]) !== null && _a !== void 0 ? _a : "",
    executorProgramId: (_b = process.env["NEXT_PUBLIC_EXECUTOR_PROGRAM_ID"]) !== null && _b !== void 0 ? _b : "",
    cluster: "devnet",
};
class ProvaSDK {
    /**
     * @param wallet    - Any wallet adapter that implements `anchor.Wallet`
     *                    (e.g. from @solana/wallet-adapter-react via `useAnchorWallet()`)
     * @param connection - Solana connection
     * @param config    - Optional: override program IDs or cluster
     */
    constructor(wallet, connection, config = {}) {
        this.connection = connection;
        this.config = Object.assign(Object.assign({}, DEFAULT_CONFIG), config);
        this.provider = new anchor.AnchorProvider(connection, wallet, {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
        });
        anchor.setProvider(this.provider);
        this.registryProgram = new anchor.Program(prova_registry_json_1.default, new web3_js_1.PublicKey(this.config.registryProgramId), this.provider);
    }
    // ── Rule registration ─────────────────────────────────────────────────────
    /**
     * Register a new cross-chain rule on Solana.
     * Escrows the execution fee in the rule PDA.
     *
     * @returns { txSig, ruleId, rulePda }
     */
    registerRule(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, registerRule_1.registerRule)(this, params);
        });
    }
    // ── Rule queries ──────────────────────────────────────────────────────────
    /**
     * Fetch all rules for a given owner pubkey.
     */
    getUserRules(owner) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, ruleStatus_1.getUserRules)(this, owner);
        });
    }
    /**
     * Fetch the current status of a single rule by its PDA address.
     */
    getRuleStatus(rulePda) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, ruleStatus_1.getRuleStatus)(this, rulePda);
        });
    }
    // ── Utilities ─────────────────────────────────────────────────────────────
    /**
     * Derive the rule PDA from owner pubkey + ruleId bytes.
     */
    deriveRulePda(owner, ruleIdHex) {
        const ruleIdBytes = Buffer.from(ruleIdHex.replace("0x", ""), "hex");
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("prova_rule"), owner.toBytes(), ruleIdBytes], this.registryProgram.programId);
        return pda;
    }
    /**
     * Generate a deterministic ruleId from owner pubkey + nonce.
     * Mirrors the off-chain monitor's rule_id generation.
     */
    generateRuleId(owner, nonce) {
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
    onRuleRegistered(callback) {
        const listenerId = this.registryProgram.addEventListener("ruleRegistered", (event) => {
            callback({
                ruleId: "0x" + Buffer.from(event.ruleId).toString("hex"),
                owner: event.owner.toBase58(),
                actionAmount: event.actionAmount.toString(),
            });
        });
        return () => {
            this.registryProgram.removeEventListener(listenerId);
        };
    }
    /**
     * Subscribe to RuleExecuted events.
     * Use this in your frontend to show the user when their rule fires.
     */
    onRuleExecuted(callback) {
        const listenerId = this.registryProgram.addEventListener("ruleExecuted", (event) => {
            callback({
                ruleId: "0x" + Buffer.from(event.ruleId).toString("hex"),
                executedAt: event.executedAt.toNumber(),
                txSignature: Buffer.from(event.txSignature).toString("hex"),
            });
        });
        return () => this.registryProgram.removeEventListener(listenerId);
    }
}
exports.ProvaSDK = ProvaSDK;
