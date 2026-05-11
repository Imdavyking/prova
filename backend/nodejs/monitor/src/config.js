"use strict";
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
exports.config = void 0;
// monitor/src/config.ts
const dotenv = __importStar(require("dotenv"));
dotenv.config();
function require_env(key) {
    const val = process.env[key];
    if (!val)
        throw new Error(`Missing required env var: ${key}`);
    return val;
}
exports.config = {
    // ── Ethereum ───────────────────────────────────────────────────────────
    ethRpcUrl: require_env("ETH_RPC_URL"),
    ethRpcWsUrl: process.env["ETH_RPC_WS_URL"] ?? "",
    ethPollIntervalMs: Number(process.env["ETH_POLL_INTERVAL_MS"] ?? 12_000),
    // ── Solana ─────────────────────────────────────────────────────────────
    solanaRpcUrl: process.env["SOLANA_RPC_URL"] ?? "https://api.devnet.solana.com",
    monitorKeypairPath: process.env["MONITOR_KEYPAIR_PATH"] ??
        `${process.env.HOME}/.config/solana/id.json`,
    // ── Program IDs ────────────────────────────────────────────────────────
    registryProgramId: require_env("REGISTRY_PROGRAM_ID"),
    executorProgramId: require_env("EXECUTOR_PROGRAM_ID"),
    // ── SP1 Prover ─────────────────────────────────────────────────────────
    // "local" | "network"
    proverMode: process.env["PROVER_MODE"] ?? "local",
    sp1ScriptPath: process.env["SP1_SCRIPT_PATH"] ?? "../sp1-prover/script",
    // ── Arcium ─────────────────────────────────────────────────────────────
    arciumCluster: process.env["ARCIUM_CLUSTER"] ?? "devnet",
    // ── Retry settings ─────────────────────────────────────────────────────
    maxRetries: Number(process.env["MAX_RETRIES"] ?? 3),
    retryDelayMs: Number(process.env["RETRY_DELAY_MS"] ?? 5_000),
};
