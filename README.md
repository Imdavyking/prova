# PROVA

**Trustless cross-chain automation. Prove a condition on one chain. Execute an action on another. No oracles. No relayers. No humans.**

> Built for the Solana Frontier Hackathon 2026

---

## What is Prova?

Every existing cross-chain automation system — Gelato, Chainlink, Wormhole — asks you to trust something: a bot, a validator set, a committee. If that thing goes offline, lies, or gets hacked, your automation breaks.

Prova is different. Instead of trusting a messenger to tell Solana what happened on Ethereum, Prova **proves** it happened using a ZK state proof. The Solana program verifies the math on-chain. Only then does it execute your action — privately, through an Arcium MXE.

```
User registers rule:  "IF ETH balance < 0.5 ETH → transfer 100 USDC on Solana"
                                    ↓
Ethereum condition triggers at block #21,847,293
                                    ↓
SP1 Groth16 proof generated: cryptographic proof that the balance dropped
                                    ↓
Proof verified on Solana by the prova_executor program
                                    ↓
Arcium MXE evaluates transfer params privately (no MEV, no front-running)
                                    ↓
100 USDC transferred to recipient. Fee released to executor. Rule marked done.
```

Zero trusted parties. ~28 seconds end-to-end. Any EVM chain → Solana.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SOURCE CHAIN                            │
│                       (Ethereum / Base / etc.)                  │
│                                                                 │
│  User's wallet ──── condition: balance < threshold              │
│  Lock contract ──── stores rule params + escrow                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │  block header + account proof
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SP1 PROVER (off-chain)                    │
│                                                                 │
│  Reads:  block header RLP + Merkle-Patricia account proof       │
│  Proves: balance < threshold at block N (Groth16 / BN254)       │
│  Output: 264-byte proof + public inputs                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │  proof bytes + public inputs
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SOLANA                                  │
│                                                                 │
│  prova_registry  ── stores rules, holds fee escrow              │
│       │                                                         │
│  prova_executor  ── verifies SP1 proof (BN254 precompiles)      │
│       │               matches public inputs to registered rule  │
│       │                                                         │
│  Arcium MXE      ── receives encrypted transfer params          │
│       │               MPC nodes validate privately              │
│       │               no single node sees plaintext             │
│       │                                                         │
│  SPL Transfer    ── vault → recipient                           │
│  Fee release     ── escrowed lamports → executor                │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Layer                               | What it does                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `sp1-prover/program`                | zkVM circuit (RISC-V). Verifies MPT account proof, asserts balance < threshold, commits public inputs               |
| `sp1-prover/script`                 | CLI that fetches ETH state via `eth_getProof`, feeds it to the prover, outputs Groth16 proof JSON                   |
| `programs/prova_registry`           | Anchor program. Stores rules, holds fee escrow, tracks rule status lifecycle                                        |
| `programs/prova_executor`           | Arcium MXE program. Verifies SP1 proof on-chain, queues confidential computation, performs SPL transfer in callback |
| `encrypted-ixs/execute_transfer.rs` | Arcis circuit. Runs inside MPC cluster. Validates transfer params privately                                         |
| `monitor/`                          | TypeScript service. Watches Ethereum, triggers proof generation, submits to Solana                                  |
| `sdk/`                              | TypeScript SDK for the frontend. Register rules, query status, subscribe to events                                  |

---

## Sponsor Tech

| Sponsor             | Where it's used                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Arcium**          | MXE confidential execution layer — transfer params are encrypted with x25519+RescueCipher, evaluated privately across MPC nodes, no MEV possible |
| **SP1 by Succinct** | Groth16 zkVM prover — proves Ethereum account state on-chain using BN254 precompiles on Solana                                                   |
| **Phantom**         | Wallet UX layer for rule registration and status tracking                                                                                        |
| **Privy**           | Embedded wallet auth — single login for both the source chain and Solana                                                                         |
| **Coinbase**        | Base as source chain support + multi-chain settlement via their SDK                                                                              |

---

## Repository Structure

```
prova/
├── Anchor.toml
├── Arcium.toml
├── Cargo.toml                          # Workspace root
│
├── programs/
│   ├── prova_registry/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs                  # Anchor: rule storage, fee escrow
│   └── prova_executor/
│       ├── Cargo.toml
│       └── src/lib.rs                  # Arcium MXE: proof verify + transfer
│
├── encrypted-ixs/
│   └── execute_transfer.rs             # Arcis circuit: confidential transfer logic
│
├── sp1-prover/
│   ├── program/
│   │   ├── Cargo.toml
│   │   └── src/main.rs                 # zkVM circuit: proves ETH balance < threshold
│   └── script/
│       ├── Cargo.toml
│       └── src/main.rs                 # CLI: fetch ETH state, generate proof
│
├── monitor/
│   ├── package.json
│   └── src/
│       ├── index.ts                    # Main entry point
│       ├── config.ts                   # Env config
│       ├── logger.ts                   # Winston logger
│       ├── ethWatcher.ts               # Polls Ethereum for condition triggers
│       ├── proofGenerator.ts           # Calls SP1 prover subprocess
│       ├── solanaSubmitter.ts          # Submits proof + queues Arcium computation
│       └── registryLoader.ts           # Loads active rules from Solana
│
└── sdk/
    ├── package.json
    └── src/
        ├── index.ts                    # Public exports
        ├── types.ts                    # Shared types and enums
        ├── ProvaSDK.ts                 # Main SDK class
        ├── registerRule.ts             # Register a rule on Solana
        └── ruleStatus.ts               # Query rule status + polling util
```

---

## Prerequisites

| Tool       | Version | Install                                                              |
| ---------- | ------- | -------------------------------------------------------------------- |
| Rust       | stable  | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`    |
| Solana CLI | 1.18+   | `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`    |
| Anchor CLI | 0.29.0  | `cargo install --git https://github.com/coral-xyz/anchor anchor-cli` |
| Arcium CLI | latest  | `cargo install arcium-cli`                                           |
| SP1        | latest  | `curl -L https://sp1.succinct.xyz \| bash && sp1up`                  |
| Node.js    | 20+     | via `nvm`                                                            |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-handle/prova
cd prova

# Install monitor dependencies
cd monitor && yarn && cd ..

# Install SDK dependencies
cd sdk && yarn && cd ..
```

### 2. Configure environment

```bash
# monitor/.env
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_RPC_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
SOLANA_RPC_URL=https://api.devnet.solana.com
MONITOR_KEYPAIR_PATH=~/.config/solana/monitor.json
REGISTRY_PROGRAM_ID=REGSpRoVaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
EXECUTOR_PROGRAM_ID=EXECpRoVaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
PROVER_MODE=local
ARCIUM_CLUSTER=devnet

# Optional: Succinct Prover Network key (for faster proving)
SP1_PRIVATE_KEY=
```

### 3. Generate a monitor keypair

```bash
solana-keygen new -o ~/.config/solana/monitor.json
solana airdrop 2 ~/.config/solana/monitor.json --url devnet
```

---

## Build

### Solana programs

```bash
# Build both Anchor programs + the Arcium MXE
arcium build
```

This compiles `prova_registry`, `prova_executor`, and the `execute_transfer.rs` Arcis circuit into the MXE binary.

### SP1 prover

```bash
cd sp1-prover/program

# Build the zkVM circuit to RISC-V ELF
cargo prove build

# Get the verification key hash (put this in prova_executor/src/lib.rs → BALANCE_PROVER_VK_HASH)
cargo prove vk
```

### Monitor

```bash
cd monitor
yarn build
```

---

## Deploy

### 1. Deploy Solana programs

```bash
# Deploy to devnet
arcium deploy --cluster devnet

# Initialize the registry
yarn ts-node scripts/initialize_registry.ts

# Initialize the Arcium computation definition (once per deploy)
yarn ts-node scripts/init_comp_def.ts

# Fund the vault token account with USDC
yarn ts-node scripts/fund_vault.ts --amount 10000
```

### 2. Update Arcium.toml

After `arcium deploy`, paste the MXE key into `Arcium.toml`:

```toml
[mxe]
name    = "prova_executor"
mxe_key = "YOUR_MXE_KEY_HERE"  # from arcium deploy output

[clusters.devnet]
offset = 456
```

### 3. Update program IDs

After deploy, update `Anchor.toml`, `Arcium.toml`, and your `.env` with the real program IDs from the deploy output.

---

## Run

### Start the monitor

```bash
cd monitor
yarn start
```

The monitor will:

1. Load all active rules from `prova_registry`
2. Subscribe to new `RuleRegistered` events
3. Poll Ethereum every ~12 seconds for condition triggers
4. On trigger: generate SP1 proof → submit to Solana → queue Arcium computation → await callback

```
2026-05-04T12:00:00Z [info] 🚀 Prova Monitor starting...
2026-05-04T12:00:01Z [info] Loaded 3 active rules
2026-05-04T12:00:01Z [info] ETH watcher started { interval: 12000 }
2026-05-04T12:01:13Z [info] 🔔 Condition triggered! { ruleId: '0xdeadbeef...', block: 21847293 }
2026-05-04T12:01:13Z [info] Generating ZK proof...
2026-05-04T12:02:41Z [info] ✓ Proof generated in 88.2s
2026-05-04T12:02:43Z [info] Rule → Triggered { sig: '5xGH...' }
2026-05-04T12:02:44Z [info] Rule → Proving { sig: '7rKP...' }
2026-05-04T12:02:45Z [info] Proof tx queued { queueSig: '3mNQ...' }
2026-05-04T12:02:45Z [info] Waiting for Arcium MXE computation...
2026-05-04T12:03:10Z [info] ✓ Arcium computation finalized { finalizeSig: '9wBZ...' }
2026-05-04T12:03:10Z [info] ✅ Rule fully executed! { ruleId: '0xdeadbeef...' }
```

### Generate a proof manually

```bash
cd sp1-prover/script

cargo run --release -- \
  --rpc-url https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
  --block 21847293 \
  --wallet 0x4F8a...9B2c \
  --threshold 500000000000000000 \
  --rule-id 0xdeadbeef... \
  --output proof.json
```

---

## SDK Usage

Use the SDK in your React frontend (install from `sdk/`):

```typescript
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { ProvaSDK, SourceChain, ConditionType, ActionType } from "@prova/sdk";

function useProva() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  return wallet ? new ProvaSDK(wallet, connection) : null;
}

// Register a rule
const sdk = useProva();

const { txSig, ruleId, rulePda } = await sdk.registerRule({
  sourceChain: SourceChain.Ethereum,
  conditionType: ConditionType.BalanceBelow,
  watchAddress: "0x4F8a...9B2c",
  tokenAddress: "0x0000000000000000000000000000000000000000",
  thresholdWei: "500000000000000000", // 0.5 ETH in wei
  actionType: ActionType.TransferSpl,
  recipient: "7GsnYmPq...", // Solana pubkey
  tokenMint: "EPjFWdd5...", // USDC mint
  actionAmount: "100000000", // 100 USDC (6 decimals)
  escrowedFeeLamports: 50_000,
});

// Fetch all rules for the connected wallet
const rules = await sdk.getUserRules(wallet.publicKey);

// Poll until a rule executes
import { pollUntilExecuted, RuleStatus } from "@prova/sdk";

await pollUntilExecuted(sdk, new PublicKey(rulePda), (status) => {
  console.log("Status update:", status);
  // Active → Triggered → Proving → Executed
});

// Subscribe to execution events in real time
const unsubscribe = sdk.onRuleExecuted(({ ruleId, executedAt }) => {
  console.log(`Rule ${ruleId} executed at ${executedAt}`);
});
```

---

## How the ZK Proof Works

The SP1 circuit (`sp1-prover/program/src/main.rs`) runs inside the SP1 zkVM and proves the following in zero knowledge:

1. **Block header integrity** — the RLP-encoded block header hashes to the claimed `state_root`
2. **Account inclusion** — the account at `wallet_address` exists in the state trie (Merkle-Patricia proof)
3. **Balance condition** — the account's balance decoded from RLP is strictly less than `threshold_wei`

The proof commits four public values: `block_number`, `state_root`, `wallet_address`, `threshold_wei`. The Solana verifier checks these against the registered rule. If they don't match, the transaction reverts.

**Proof stats:**

- Circuit: Groth16 on BN254
- Proof size: ~264 bytes
- Solana verification cost: ~280k compute units
- Proving time: ~90s local CPU, ~20s Succinct Network

---

## How Arcium Protects the Execution

Without Arcium, anyone watching the Solana mempool could see the rule is about to execute and front-run the USDC transfer. With Arcium:

1. The monitor encrypts `(amount, recipient_tag)` with x25519 + RescueCipher before submitting
2. The `execute_transfer` Arcis circuit runs across MPC nodes — no single node ever reconstructs the plaintext
3. The circuit validates constraints privately: `amount > 0`, `amount <= MAX_TRANSFER_AMOUNT`, `recipient_tag != 0`
4. Only after MPC consensus does the Solana callback fire the actual SPL transfer

The result: the transfer is MEV-resistant and the rule parameters stay private until settlement.

---

## Rule Status Lifecycle

```
ACTIVE
  │  condition detected by monitor
  ▼
TRIGGERED
  │  proof generation started
  ▼
PROVING
  │  proof submitted, Arcium computation queued
  ▼
EXECUTED  ──── escrowed fee released to executor
```

A rule can also transition to `CANCELLED` from `ACTIVE` if the owner calls `cancel_rule`, which returns the escrowed fee.

---

## Security Considerations

- **Double-execution prevention** — the registry rejects any status transition that skips a step. A proof cannot be submitted for a rule that is not in `Triggered` status.
- **Public input binding** — the executor program checks that `wallet_address`, `threshold_wei`, and `rule_id` in the proof public values exactly match the registered rule. Mismatched proofs are rejected.
- **Fee slashing (TODO)** — in production, the executor network should stake and be slashable for submitting invalid proofs. Currently the monitor keypair is trusted.
- **Proof replay** — rule IDs are unique and status transitions are one-way. A proof for an already-executed rule will fail the `RuleNotProving` check.
- **Arcium MXE output** — the callback verifies the computation output against the cluster account before executing the transfer. A failed MPC computation returns an error, not a silent no-op.

---

## Limitations (Current)

- **EVM source chains only** — the SP1 circuit understands Ethereum's MPT structure. Cosmos/Substrate require different proof circuits.
- **SPL token actions only** — native SOL transfers and arbitrary CPI calls are not yet supported.
- **Single condition per rule** — composite conditions (AND/OR of multiple triggers) are not implemented.
- **Manual monitor** — the executor node network is currently a single trusted keypair. Decentralized staked executor network is the next step.

---

## License

MIT — built for the Solana Frontier Hackathon 2026.
