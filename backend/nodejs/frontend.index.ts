// sdk/src/index.ts
//
// Prova SDK — frontend-facing TypeScript client.
//
// Usage (in your React components):
//   import { ProvaSDK } from "@prova/sdk";
//   const sdk = new ProvaSDK(wallet, connection);
//   await sdk.registerRule({ ... });
//   const rules = await sdk.getUserRules(ownerPubkey);

export { ProvaSDK } from "./ProvaSDK";
export { registerRule } from "./registerRule";
export { getUserRules, getRuleStatus } from "./ruleStatus";
export * from "./types";
