"use strict";
// sdk/src/ruleStatus.ts
//
// Query functions for reading rule state from prova_registry.
// Called by ProvaSDK.getUserRules() and ProvaSDK.getRuleStatus().
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
exports.getUserRules = getUserRules;
exports.getRuleStatus = getRuleStatus;
exports.getRule = getRule;
exports.pollUntilExecuted = pollUntilExecuted;
const types_1 = require("./types");
// ── Status map ────────────────────────────────────────────────────────────────
// Anchor returns Rust enums as objects: { Active: {} } | { Triggered: {} } etc.
function parseStatus(raw) {
    var _a;
    const key = Object.keys(raw)[0];
    const map = {
        active: types_1.RuleStatus.Active,
        triggered: types_1.RuleStatus.Triggered,
        proving: types_1.RuleStatus.Proving,
        executed: types_1.RuleStatus.Executed,
        cancelled: types_1.RuleStatus.Cancelled,
    };
    return (_a = map[key.toLowerCase()]) !== null && _a !== void 0 ? _a : types_1.RuleStatus.Active;
}
function parseEnum(raw, fallback) {
    var _a;
    const key = Object.keys(raw)[0];
    return (_a = key) !== null && _a !== void 0 ? _a : fallback;
}
function rawToRule(address, data) {
    return {
        address: address.toBase58(),
        ruleId: "0x" + Buffer.from(data.ruleId).toString("hex"),
        owner: data.owner.toBase58(),
        sourceChain: parseEnum(data.sourceChain, types_1.SourceChain.Ethereum),
        conditionType: parseEnum(data.conditionType, types_1.ConditionType.BalanceBelow),
        watchAddress: "0x" + Buffer.from(data.watchAddress).toString("hex"),
        tokenAddress: "0x" + Buffer.from(data.tokenAddress).toString("hex"),
        thresholdWei: BigInt("0x" + Buffer.from(data.thresholdWei).toString("hex")).toString(),
        actionType: parseEnum(data.actionType, types_1.ActionType.TransferSpl),
        recipient: data.recipient.toBase58(),
        tokenMint: data.tokenMint.toBase58(),
        actionAmount: data.actionAmount.toString(),
        escrowedFee: data.escrowedFee.toString(),
        status: parseStatus(data.status),
        registeredAt: data.registeredAt.toNumber(),
        executedAt: data.executedAt.toNumber(),
    };
}
/**
 * Fetch all Rule accounts owned by a specific wallet.
 * Uses a memcmp filter on the `owner` field (offset 8 + 32 = 40 for rule_id, then owner at 8).
 */
function getUserRules(sdk, owner) {
    return __awaiter(this, void 0, void 0, function* () {
        // owner field is at offset 8 (discriminator) in the Rule account
        const accounts = yield sdk.registryProgram.account["rule"].all([
            {
                memcmp: {
                    offset: 8, // after 8-byte discriminator
                    bytes: owner.toBase58(),
                },
            },
        ]);
        return accounts
            .map((acc) => rawToRule(acc.publicKey, acc.account))
            .sort((a, b) => b.registeredAt - a.registeredAt); // newest first
    });
}
/**
 * Fetch the current status of a single rule by PDA address.
 */
function getRuleStatus(sdk, rulePda) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield sdk.registryProgram.account["rule"].fetch(rulePda);
        return parseStatus(data.status);
    });
}
/**
 * Fetch a single rule by PDA address.
 */
function getRule(sdk, rulePda) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield sdk.registryProgram.account["rule"].fetch(rulePda);
        return rawToRule(rulePda, data);
    });
}
/**
 * Poll a rule's status until it reaches Executed or Cancelled.
 * Useful for showing live progress in the frontend.
 *
 * @param onUpdate   - Called each time the status changes
 * @param intervalMs - How often to poll (default: 4000ms)
 * @param timeoutMs  - Give up after this long (default: 5 minutes)
 */
function pollUntilExecuted(sdk_1, rulePda_1, onUpdate_1) {
    return __awaiter(this, arguments, void 0, function* (sdk, rulePda, onUpdate, intervalMs = 4000, timeoutMs = 300000) {
        const deadline = Date.now() + timeoutMs;
        let lastStatus = null;
        while (Date.now() < deadline) {
            const status = yield getRuleStatus(sdk, rulePda);
            if (status !== lastStatus) {
                onUpdate(status);
                lastStatus = status;
            }
            if (status === types_1.RuleStatus.Executed || status === types_1.RuleStatus.Cancelled) {
                return status;
            }
            yield sleep(intervalMs);
        }
        throw new Error(`Timed out waiting for rule ${rulePda.toBase58()} to execute`);
    });
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
