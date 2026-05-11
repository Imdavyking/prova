"use strict";
// sdk/src/index.ts
//
// Prova SDK — frontend-facing TypeScript client.
//
// Usage (in your React components):
//   import { ProvaSDK } from "@prova/sdk";
//   const sdk = new ProvaSDK(wallet, connection);
//   await sdk.registerRule({ ... });
//   const rules = await sdk.getUserRules(ownerPubkey);
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuleStatus = exports.getUserRules = exports.registerRule = exports.ProvaSDK = void 0;
var ProvaSDK_1 = require("./ProvaSDK");
Object.defineProperty(exports, "ProvaSDK", { enumerable: true, get: function () { return ProvaSDK_1.ProvaSDK; } });
var registerRule_1 = require("./registerRule");
Object.defineProperty(exports, "registerRule", { enumerable: true, get: function () { return registerRule_1.registerRule; } });
var ruleStatus_1 = require("./ruleStatus");
Object.defineProperty(exports, "getUserRules", { enumerable: true, get: function () { return ruleStatus_1.getUserRules; } });
Object.defineProperty(exports, "getRuleStatus", { enumerable: true, get: function () { return ruleStatus_1.getRuleStatus; } });
__exportStar(require("./types"), exports);
