"use strict";
// sdk/src/types.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleStatus = exports.ActionType = exports.ConditionType = exports.SourceChain = void 0;
var SourceChain;
(function (SourceChain) {
    SourceChain["Ethereum"] = "Ethereum";
    SourceChain["Base"] = "Base";
    SourceChain["Arbitrum"] = "Arbitrum";
    SourceChain["Optimism"] = "Optimism";
    SourceChain["Polygon"] = "Polygon";
})(SourceChain || (exports.SourceChain = SourceChain = {}));
var ConditionType;
(function (ConditionType) {
    ConditionType["BalanceBelow"] = "BalanceBelow";
    ConditionType["TokenBalanceBelow"] = "TokenBalanceBelow";
    ConditionType["BlockReached"] = "BlockReached";
    ConditionType["StorageSlotEquals"] = "StorageSlotEquals";
})(ConditionType || (exports.ConditionType = ConditionType = {}));
var ActionType;
(function (ActionType) {
    ActionType["TransferSpl"] = "TransferSpl";
    ActionType["TransferSol"] = "TransferSol";
})(ActionType || (exports.ActionType = ActionType = {}));
var RuleStatus;
(function (RuleStatus) {
    RuleStatus["Active"] = "Active";
    RuleStatus["Triggered"] = "Triggered";
    RuleStatus["Proving"] = "Proving";
    RuleStatus["Executed"] = "Executed";
    RuleStatus["Cancelled"] = "Cancelled";
})(RuleStatus || (exports.RuleStatus = RuleStatus = {}));
