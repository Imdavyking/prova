// sdk/src/types.ts

export enum SourceChain {
  Ethereum = "Ethereum",
  Base = "Base",
  Arbitrum = "Arbitrum",
  Optimism = "Optimism",
  Polygon = "Polygon",
}

export enum ConditionType {
  BalanceBelow = "BalanceBelow",
  TokenBalanceBelow = "TokenBalanceBelow",
  BlockReached = "BlockReached",
  StorageSlotEquals = "StorageSlotEquals",
}

export enum ActionType {
  TransferSpl = "TransferSpl",
  TransferSol = "TransferSol",
}

export enum RuleStatus {
  Active = "Active",
  Triggered = "Triggered",
  Proving = "Proving",
  Executed = "Executed",
  Cancelled = "Cancelled",
}

export interface RegisterRuleParams {
  /** Source chain to monitor */
  sourceChain: SourceChain;
  /** What condition triggers the rule */
  conditionType: ConditionType;
  /** ETH address to watch (0x-prefixed) */
  watchAddress: string;
  /** Token contract to watch (0x00...00 for native ETH) */
  tokenAddress: string;
  /** Threshold in wei (as string to avoid BigInt serialization issues) */
  thresholdWei: string;
  /** What happens on Solana when condition is met */
  actionType: ActionType;
  /** Solana recipient pubkey (base58) */
  recipient: string;
  /** SPL token mint pubkey (base58) */
  tokenMint: string;
  /** Amount to transfer in SPL token smallest unit */
  actionAmount: string;
  /** Execution fee in lamports to escrow */
  escrowedFeeLamports: number;
}

export interface Rule {
  /** PDA address of this rule account */
  address: string;
  ruleId: string; // 0x-prefixed 32-byte hex
  owner: string; // Solana pubkey base58
  sourceChain: SourceChain;
  conditionType: ConditionType;
  watchAddress: string; // 0x-prefixed ETH address
  tokenAddress: string;
  thresholdWei: string;
  actionType: ActionType;
  recipient: string;
  tokenMint: string;
  actionAmount: string;
  escrowedFee: string;
  status: RuleStatus;
  registeredAt: number; // unix timestamp
  executedAt: number; // unix timestamp, 0 if pending
}

export interface ProvaSDKConfig {
  registryProgramId: string;
  executorProgramId: string;
  /** Solana cluster */
  cluster: "mainnet-beta" | "devnet" | "localnet";
}
