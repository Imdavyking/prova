"use strict";
// monitor/src/proofGenerator.ts
//
// Invokes the SP1 Rust proof generation script as a subprocess.
// Returns the raw Groth16 proof bytes and decoded public inputs.
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
exports.ProofGenerator = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const util_1 = require("util");
const logger_1 = require("./logger");
const config_1 = require("./config");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
class ProofGenerator {
    scriptBin;
    constructor() {
        // Path to the compiled SP1 prover binary
        this.scriptBin = path.resolve(config_1.config.sp1ScriptPath, "../../target/release/prova-prove");
    }
    async generate(event) {
        const { rule, blockNumber, stateRoot } = event;
        logger_1.logger.info("Generating ZK proof...", {
            ruleId: rule.ruleId,
            block: blockNumber,
            wallet: rule.watchAddress,
            threshold: rule.thresholdWei.toString(),
        });
        // Write proof to a temp file
        const tmpDir = os.tmpdir();
        const outFile = path.join(tmpDir, `proof_${rule.ruleId.slice(2, 10)}_${blockNumber}.json`);
        const args = [
            "--rpc-url",
            config_1.config.ethRpcUrl,
            "--block",
            blockNumber.toString(),
            "--wallet",
            rule.watchAddress,
            "--threshold",
            rule.thresholdWei.toString(),
            "--rule-id",
            rule.ruleId,
            "--output",
            outFile,
        ];
        if (config_1.config.proverMode === "network") {
            args.push("--use-network");
        }
        const env = {
            ...process.env,
            RUST_LOG: "info",
            // Succinct prover network key (if using network mode)
            SP1_PRIVATE_KEY: process.env["SP1_PRIVATE_KEY"] ?? "",
        };
        logger_1.logger.info("Running SP1 prover...", { args: args.join(" ") });
        const start = Date.now();
        try {
            const { stdout, stderr } = await execFileAsync(this.scriptBin, args, {
                env,
                timeout: 300_000, // 5-minute timeout
                maxBuffer: 50 * 1024 * 1024,
            });
            if (stdout)
                logger_1.logger.debug("Prover stdout", { stdout: stdout.slice(0, 500) });
            if (stderr)
                logger_1.logger.debug("Prover stderr", { stderr: stderr.slice(0, 500) });
        }
        catch (err) {
            logger_1.logger.error("Proof generation failed", {
                error: String(err.message),
                stderr: err.stderr?.slice(0, 1000),
            });
            throw new Error(`SP1 proof generation failed: ${err.message}`);
        }
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        logger_1.logger.info(`✓ Proof generated in ${elapsed}s`);
        // ── Parse output file ──────────────────────────────────────────────
        if (!fs.existsSync(outFile)) {
            throw new Error(`Proof output file not found: ${outFile}`);
        }
        const raw = JSON.parse(fs.readFileSync(outFile, "utf8"));
        // Clean up temp file
        fs.unlinkSync(outFile);
        const proofBytes = Buffer.from(raw.proof_bytes, "hex");
        logger_1.logger.info("Proof details", {
            size: proofBytes.length,
            vkHash: raw.vk_hash,
            block: raw.public_inputs.block_number,
        });
        return {
            proofBytes,
            publicInputs: {
                blockNumber: raw.public_inputs.block_number,
                stateRoot: raw.public_inputs.state_root,
                walletAddress: raw.public_inputs.wallet_address,
                thresholdWei: raw.public_inputs.threshold_wei.toString(),
                ruleId: raw.public_inputs.rule_id,
            },
            vkHash: raw.vk_hash,
        };
    }
}
exports.ProofGenerator = ProofGenerator;
