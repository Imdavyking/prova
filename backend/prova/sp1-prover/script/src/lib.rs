//! sp1-prover/script/src/main.rs
//!
//! Off-chain proof generation script.
//! Run this when a condition is triggered to produce the Groth16 proof
//! that gets submitted to Solana.
//!
//! Usage:
//!   cargo run --bin prova-prove -- \
//!     --rpc-url https://eth-mainnet.g.alchemy.com/v2/<key> \
//!     --block 21847293 \
//!     --wallet 0x4F8a...9B2c \
//!     --threshold 500000000000000000 \
//!     --rule-id 0xdeadbeef...

use anyhow::{Context, Result};
use sp1_sdk::{ProverClient, SP1Stdin, SP1ProofWithPublicValues};
use serde::{Deserialize, Serialize};

// Re-use the types from the prover program
include!("../../program/src/main.rs");

const PROVER_ELF: &[u8] =
    include_bytes!("../../../target/elf-compilation/riscv32im-succinct-zkvm-elf/release/balance-prover");

#[derive(Debug, clap::Parser)]
#[command(name = "prova-prove")]
struct Args {
    /// Ethereum JSON-RPC URL
    #[arg(long, env = "ETH_RPC_URL")]
    rpc_url: String,

    /// Block number to prove
    #[arg(long)]
    block: u64,

    /// Wallet address to check (0x-prefixed hex)
    #[arg(long)]
    wallet: String,

    /// Threshold in wei
    #[arg(long)]
    threshold: String,

    /// Prova rule_id (0x-prefixed 32-byte hex)
    #[arg(long)]
    rule_id: String,

    /// Output path for the proof JSON
    #[arg(long, default_value = "proof.json")]
    output: String,

    /// Use network prover (Succinct Network) instead of local CPU prover
    #[arg(long)]
    use_network: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = <Args as clap::Parser>::parse();

    println!("🔍 Fetching Ethereum state at block {}...", args.block);

    // ── 1. Fetch block header and account proof from Ethereum ────────────
    let (public_inputs, witness) = fetch_eth_proof_data(
        &args.rpc_url,
        args.block,
        &args.wallet,
        &args.threshold,
        &args.rule_id,
    ).await.context("Failed to fetch Ethereum proof data")?;

    println!("✓ Block header fetched. State root: 0x{}", hex::encode(public_inputs.state_root));
    println!("✓ Account proof fetched ({} nodes)", witness.account_proof.len());

    // ── 2. Set up SP1 stdin ──────────────────────────────────────────────
    let mut stdin = SP1Stdin::new();
    stdin.write(&public_inputs);
    stdin.write(&witness);

    // ── 3. Generate Groth16 proof ────────────────────────────────────────
    println!("⚡ Generating ZK proof (this takes ~60-120 seconds)...");

    let client = if args.use_network {
        println!("  Using Succinct Prover Network...");
        ProverClient::network()
    } else {
        println!("  Using local CPU prover...");
        ProverClient::local()
    };

    let (pk, vk) = client.setup(PROVER_ELF);

    // Prove and get Groth16 compressed proof
    let proof: SP1ProofWithPublicValues = client
        .prove(&pk, &stdin)
        .groth16()
        .run()
        .context("Proof generation failed")?;

    println!("✓ Proof generated!");
    println!("  Proof size: {} bytes", proof.bytes().len());

    // ── 4. Verify locally before submitting ──────────────────────────────
    client.verify(&proof, &vk).context("Local proof verification failed")?;
    println!("✓ Proof verified locally");

    // ── 5. Serialize and write output ────────────────────────────────────
    let output = ProofOutput {
        proof_bytes:   hex::encode(proof.bytes()),
        public_inputs: serde_json::to_value(&public_inputs)?,
        vk_hash:       hex::encode(vk.bytes32()),
    };

    let json = serde_json::to_string_pretty(&output)?;
    std::fs::write(&args.output, &json)?;

    println!("✓ Proof written to {}", args.output);
    println!("\n📋 Public inputs:");
    println!("  block_number:   {}", public_inputs.block_number);
    println!("  state_root:     0x{}", hex::encode(public_inputs.state_root));
    println!("  wallet_address: 0x{}", hex::encode(public_inputs.wallet_address));
    println!("  rule_id:        0x{}", hex::encode(public_inputs.rule_id));

    Ok(())
}

#[derive(Serialize, Deserialize)]
struct ProofOutput {
    proof_bytes:   String,
    public_inputs: serde_json::Value,
    vk_hash:       String,
}

/// Fetch block header, account proof, and assemble witness from Ethereum JSON-RPC.
async fn fetch_eth_proof_data(
    rpc_url:      &str,
    block_number: u64,
    wallet:       &str,
    threshold_str: &str,
    rule_id_hex:  &str,
) -> Result<(BalanceProofPublicInputs, BalanceProofWitness)> {
    let client = reqwest::Client::new();

    // ── eth_getBlockByNumber ──────────────────────────────────────────────
    let block_hex = format!("0x{:x}", block_number);
    let block_resp: serde_json::Value = client
        .post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getBlockByNumber",
            "params": [block_hex, false]
        }))
        .send().await?
        .json().await?;

    let block = block_resp["result"].as_object()
        .context("No block result in response")?;

    let state_root_hex = block["stateRoot"]
        .as_str().context("Missing stateRoot")?
        .trim_start_matches("0x");

    let mut state_root = [0u8; 32];
    hex::decode_to_slice(state_root_hex, &mut state_root)?;

    // ── eth_getProof — Merkle-Patricia proof for the account ─────────────
    let proof_resp: serde_json::Value = client
        .post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "eth_getProof",
            "params": [wallet, [], block_hex]
        }))
        .send().await?
        .json().await?;

    let proof_result = &proof_resp["result"];

    // Decode account proof nodes
    let account_proof: Vec<Vec<u8>> = proof_result["accountProof"]
        .as_array().context("Missing accountProof")?
        .iter()
        .map(|node| {
            let hex_str = node.as_str().unwrap_or("").trim_start_matches("0x");
            hex::decode(hex_str).unwrap_or_default()
        })
        .collect();

    // Get account RLP — the leaf value of the proof
    // In eth_getProof, we reconstruct it from nonce/balance/storageHash/codeHash
    let nonce_hex    = proof_result["nonce"].as_str().unwrap_or("0x0").trim_start_matches("0x");
    let balance_hex  = proof_result["balance"].as_str().unwrap_or("0x0").trim_start_matches("0x");
    let storage_hash = proof_result["storageHash"].as_str().unwrap_or("")
        .trim_start_matches("0x");
    let code_hash    = proof_result["codeHash"].as_str().unwrap_or("")
        .trim_start_matches("0x");

    let account_rlp = encode_account_rlp(nonce_hex, balance_hex, storage_hash, code_hash)?;

    // ── Assemble public inputs ────────────────────────────────────────────
    let wallet_clean = wallet.trim_start_matches("0x");
    let mut wallet_address = [0u8; 20];
    hex::decode_to_slice(wallet_clean, &mut wallet_address)?;

    let threshold_u256: u128 = threshold_str.parse()?;
    let mut threshold_wei = [0u8; 32];
    threshold_wei[16..].copy_from_slice(&threshold_u256.to_be_bytes());

    let rule_id_clean = rule_id_hex.trim_start_matches("0x");
    let mut rule_id = [0u8; 32];
    hex::decode_to_slice(rule_id_clean, &mut rule_id)?;

    // Fetch the block header RLP (needed inside the zkVM)
    let header_rlp = fetch_block_header_rlp(&client, rpc_url, &block_hex).await?;

    Ok((
        BalanceProofPublicInputs {
            block_number: block_number,
            state_root,
            wallet_address,
            threshold_wei,
            rule_id,
        },
        BalanceProofWitness {
            block_header_rlp: header_rlp,
            account_proof,
            account_rlp,
        },
    ))
}

/// Fetch the RLP-encoded block header via debug_getRawHeader or reconstruct it.
async fn fetch_block_header_rlp(
    client:    &reqwest::Client,
    rpc_url:   &str,
    block_hex: &str,
) -> Result<Vec<u8>> {
    // Try debug_getRawHeader first (available on most archive nodes)
    let resp: serde_json::Value = client
        .post(rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "debug_getRawHeader",
            "params": [block_hex]
        }))
        .send().await?
        .json().await?;

    if let Some(raw) = resp["result"].as_str() {
        let hex_str = raw.trim_start_matches("0x");
        return Ok(hex::decode(hex_str)?);
    }

    anyhow::bail!("debug_getRawHeader not available — use an archive node (Alchemy, Infura archive)")
}

/// RLP-encode account state from its component fields.
fn encode_account_rlp(
    nonce_hex:    &str,
    balance_hex:  &str,
    storage_hash: &str,
    code_hash:    &str,
) -> Result<Vec<u8>> {
    // Simple RLP list encoding: [nonce, balance, storageHash, codeHash]
    let nonce_bytes   = hex::decode(if nonce_hex.is_empty() { "00" } else { nonce_hex })?;
    let balance_bytes = hex::decode(if balance_hex.is_empty() { "00" } else { balance_hex })?;
    let storage_bytes = hex::decode(storage_hash)?;
    let code_bytes    = hex::decode(code_hash)?;

    let mut encoded = Vec::new();
    rlp_encode_item(&nonce_bytes, &mut encoded);
    rlp_encode_item(&balance_bytes, &mut encoded);
    rlp_encode_item(&storage_bytes, &mut encoded);
    rlp_encode_item(&code_bytes, &mut encoded);

    // Wrap in list prefix
    let mut result = Vec::new();
    rlp_encode_list_prefix(encoded.len(), &mut result);
    result.extend(encoded);
    Ok(result)
}

fn rlp_encode_item(data: &[u8], out: &mut Vec<u8>) {
    if data.len() == 1 && data[0] < 0x80 {
        out.push(data[0]);
    } else if data.len() <= 55 {
        out.push(0x80 + data.len() as u8);
        out.extend_from_slice(data);
    } else {
        let len_bytes = encode_length_bytes(data.len());
        out.push(0xb7 + len_bytes.len() as u8);
        out.extend_from_slice(&len_bytes);
        out.extend_from_slice(data);
    }
}

fn rlp_encode_list_prefix(len: usize, out: &mut Vec<u8>) {
    if len <= 55 {
        out.push(0xc0 + len as u8);
    } else {
        let len_bytes = encode_length_bytes(len);
        out.push(0xf7 + len_bytes.len() as u8);
        out.extend_from_slice(&len_bytes);
    }
}

fn encode_length_bytes(len: usize) -> Vec<u8> {
    let mut out = Vec::new();
    let mut n = len;
    while n > 0 { out.insert(0, (n & 0xff) as u8); n >>= 8; }
    out
}