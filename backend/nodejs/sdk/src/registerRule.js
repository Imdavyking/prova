"use strict";
// sdk/src/registerRule.ts
//
// Builds and sends the register_rule instruction to prova_registry.
// Called by ProvaSDK.registerRule().
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRule = registerRule;
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@coral-xyz/anchor"));
// ── Enum → Anchor discriminant maps ──────────────────────────────────────────
// Anchor serializes Rust enums as `{ EnumVariant: {} }` objects.
function toAnchorEnum(value) {
    return { [value]: {} };
}
function registerRule(sdk, params) {
    return __awaiter(this, void 0, void 0, function* () {
        const owner = sdk.provider.wallet.publicKey;
        // Generate a ruleId (use timestamp as nonce — deterministic per wallet+time)
        const nonce = Date.now();
        const ruleId = sdk.generateRuleId(owner, nonce);
        const ruleIdBytes = Buffer.from(ruleId.replace("0x", ""), "hex");
        // Derive rule PDA
        const [rulePda, _bump] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("prova_rule"), owner.toBytes(), ruleIdBytes], sdk.registryProgram.programId);
        // Derive registry state PDA
        const [registryStatePda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("prova_registry")], sdk.registryProgram.programId);
        // Pad ETH address hex to 20 bytes
        const watchAddressBytes = hexTo20Bytes(params.watchAddress);
        const tokenAddressBytes = hexTo20Bytes(params.tokenAddress);
        // Pad threshold to 32 bytes (u256 big-endian)
        const thresholdBytes = bigintTo32Bytes(BigInt(params.thresholdWei));
        // Build the params object matching RegisterRuleParams in Rust
        const registerParams = {
            ruleId: Array.from(ruleIdBytes),
            sourceChain: toAnchorEnum(params.sourceChain),
            conditionType: toAnchorEnum(params.conditionType),
            watchAddress: Array.from(watchAddressBytes),
            tokenAddress: Array.from(tokenAddressBytes),
            thresholdWei: Array.from(thresholdBytes),
            actionType: toAnchorEnum(params.actionType),
            recipient: new web3_js_1.PublicKey(params.recipient),
            tokenMint: new web3_js_1.PublicKey(params.tokenMint),
            actionAmount: new anchor.BN(params.actionAmount),
            escrowedFee: new anchor.BN(params.escrowedFeeLamports),
        };
        const txSig = yield sdk.registryProgram.methods
            .registerRule(registerParams)
            .accounts({
            registryState: registryStatePda,
            rule: rulePda,
            owner: owner,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc({ commitment: "confirmed" });
        return {
            txSig,
            ruleId,
            rulePda: rulePda.toBase58(),
        };
    });
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function hexTo20Bytes(hex) {
    const clean = hex.replace("0x", "").padStart(40, "0");
    return Uint8Array.from(Buffer.from(clean, "hex"));
}
function bigintTo32Bytes(value) {
    const buf = Buffer.alloc(32, 0);
    let v = value;
    for (let i = 31; i >= 0 && v > 0n; i--) {
        buf[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return Uint8Array.from(buf);
}
