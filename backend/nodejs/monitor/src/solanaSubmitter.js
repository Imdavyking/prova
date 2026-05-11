"use strict";
// monitor/src/solanaSubmitter.ts
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
exports.SolanaSubmitter = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@coral-xyz/anchor"));
const client_1 = require("@arcium-hq/client");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const logger_1 = require("./logger");
const config_1 = require("./config");
const prova_registry_json_1 = __importDefault(require("../../target/idl/prova_registry.json"));
const prova_executor_json_1 = __importDefault(require("../../target/idl/prova_executor.json"));
class SolanaSubmitter {
    connection;
    monitorKeypair;
    provider;
    registryProgram;
    executorProgram;
    arciumEnv;
    constructor() {
        this.connection = new web3_js_1.Connection(config_1.config.solanaRpcUrl, "confirmed");
        const rawKp = JSON.parse(fs.readFileSync(config_1.config.monitorKeypairPath, "utf8"));
        this.monitorKeypair = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(rawKp));
        const wallet = new anchor.Wallet(this.monitorKeypair);
        this.provider = new anchor.AnchorProvider(this.connection, wallet, {
            commitment: "confirmed",
        });
        anchor.setProvider(this.provider);
        this.registryProgram = new anchor.Program(prova_registry_json_1.default, new web3_js_1.PublicKey(config_1.config.registryProgramId), this.provider);
        this.executorProgram = new anchor.Program(prova_executor_json_1.default, new web3_js_1.PublicKey(config_1.config.executorProgramId), this.provider);
        this.arciumEnv = (0, client_1.getArciumEnv)();
    }
    async submit(rule, proof) {
        logger_1.logger.info("Submitting proof to Solana...", { ruleId: rule.ruleId });
        const ruleIdBytes = Buffer.from(rule.ruleId.replace("0x", ""), "hex");
        const ownerPubkey = new web3_js_1.PublicKey(rule.owner);
        const [rulePda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("prova_rule"), ownerPubkey.toBytes(), ruleIdBytes], this.registryProgram.programId);
        await this.markTriggered(rulePda, proof.publicInputs.blockNumber);
        await this.markProving(rulePda);
        const { encryptedAmount, encryptedRecipient, pubKey, nonce } = await this.encryptForArcium(rule);
        const computationOffset = new anchor.BN((0, crypto_1.randomBytes)(8), "hex");
        const queueSig = await this.submitProofTx(rule, rulePda, proof, ruleIdBytes, computationOffset, encryptedAmount, encryptedRecipient, pubKey, nonce);
        logger_1.logger.info("Proof tx queued", { queueSig });
        logger_1.logger.info("Waiting for Arcium MXE computation...");
        const finalizeSig = await (0, client_1.awaitComputationFinalization)(this.provider, computationOffset, this.executorProgram.programId, "confirmed");
        logger_1.logger.info("✓ Arcium computation finalized", { finalizeSig });
        return finalizeSig;
    }
    async markTriggered(rulePda, blockNumber) {
        const sig = await this.registryProgram.methods
            .markTriggered(new anchor.BN(blockNumber))
            .accounts({ rule: rulePda, monitor: this.monitorKeypair.publicKey })
            .signers([this.monitorKeypair])
            .rpc();
        logger_1.logger.info("Rule → Triggered", { sig });
    }
    async markProving(rulePda) {
        const sig = await this.registryProgram.methods
            .markProving()
            .accounts({ rule: rulePda, monitor: this.monitorKeypair.publicKey })
            .signers([this.monitorKeypair])
            .rpc();
        logger_1.logger.info("Rule → Proving", { sig });
    }
    async encryptForArcium(rule) {
        // Exact pattern from Arcium hello-world docs
        const mxePublicKey = await (0, client_1.getMXEPublicKeyWithRetry)(this.provider, this.executorProgram.programId);
        const privateKey = client_1.x25519.utils.randomSecretKey();
        const pubKey = client_1.x25519.getPublicKey(privateKey);
        const sharedSecret = client_1.x25519.getSharedSecret(privateKey, mxePublicKey);
        const nonceBuf = (0, crypto_1.randomBytes)(16);
        const cipher = new client_1.RescueCipher(sharedSecret);
        const amount = BigInt(rule.actionAmount.toString());
        const recipientTag = BigInt("0x" +
            Buffer.from(new web3_js_1.PublicKey(rule.recipient).toBytes().slice(0, 8)).toString("hex"));
        const ciphertext = cipher.encrypt([amount, recipientTag], nonceBuf);
        return {
            encryptedAmount: Array.from(ciphertext[0]),
            encryptedRecipient: Array.from(ciphertext[1]),
            pubKey: Array.from(pubKey),
            nonce: new anchor.BN((0, client_1.deserializeLE)(nonceBuf).toString()),
        };
    }
    async submitProofTx(rule, rulePda, proof, ruleIdBytes, computationOffset, encryptedAmount, encryptedRecipient, pubKey, nonce) {
        const tokenMint = new web3_js_1.PublicKey(rule.tokenMint);
        const clusterOffset = this.arciumEnv.arciumClusterOffset;
        const [vaultTokenAccount] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("prova_vault"), tokenMint.toBytes()], this.executorProgram.programId);
        const [vaultAuthority] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("prova_vault")], this.executorProgram.programId);
        const [pendingExecution] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("pending_exec"), ruleIdBytes], this.executorProgram.programId);
        const { getAssociatedTokenAddress } = await import("@solana/spl-token");
        const recipientTokenAccount = await getAssociatedTokenAddress(tokenMint, new web3_js_1.PublicKey(rule.recipient));
        return this.executorProgram.methods
            .submitProofAndExecute(Array.from(proof.proofBytes), this.encodePublicInputs(proof), computationOffset, encryptedAmount, encryptedRecipient, pubKey, nonce)
            .accountsPartial({
            feePayer: this.monitorKeypair.publicKey,
            rule: rulePda,
            pendingExecution,
            vaultTokenAccount,
            vaultAuthority,
            recipientTokenAccount,
            tokenMint,
            // Arcium PDA helpers — exact same pattern as hello-world test
            computationAccount: (0, client_1.getComputationAccAddress)(clusterOffset, computationOffset),
            clusterAccount: (0, client_1.getClusterAccAddress)(clusterOffset),
            mxeAccount: (0, client_1.getMXEAccAddress)(this.executorProgram.programId),
            mempoolAccount: (0, client_1.getMempoolAccAddress)(clusterOffset),
            executingPool: (0, client_1.getExecutingPoolAccAddress)(clusterOffset),
            compDefAccount: (0, client_1.getCompDefAccAddress)(this.executorProgram.programId, Buffer.from((0, client_1.getCompDefAccOffset)("execute_transfer")).readUInt32LE()),
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .signers([this.monitorKeypair])
            .rpc({ commitment: "confirmed" });
    }
    encodePublicInputs(proof) {
        const pi = proof.publicInputs;
        const pad = (hex, len) => hex.replace("0x", "").padStart(len * 2, "0");
        return {
            blockNumber: new anchor.BN(pi.blockNumber),
            stateRoot: Array.from(Buffer.from(pad(pi.stateRoot, 32), "hex")),
            walletAddress: Array.from(Buffer.from(pad(pi.walletAddress, 20), "hex")),
            thresholdWei: Array.from(Buffer.from(pad(pi.thresholdWei, 32), "hex")),
            ruleId: Array.from(Buffer.from(pad(pi.ruleId, 32), "hex")),
        };
    }
}
exports.SolanaSubmitter = SolanaSubmitter;
