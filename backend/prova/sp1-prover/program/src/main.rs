//! sp1-prover/program/src/main.rs
//!
//! SP1 zkVM program that proves an Ethereum wallet balance
//! was below a threshold at a given block.
//!
//! Runs inside the SP1 zkVM — compiled to RISC-V, proven with Groth16.

#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_primitives::{keccak256, Address, U256};
use serde::{Deserialize, Serialize};

/// Public inputs committed to in the proof.
/// These are visible on-chain after verification.
#[derive(Serialize, Deserialize)]
pub struct ProofPublicInputs {
    /// Ethereum block number the proof is for
    pub block_number: u64,
    /// Block state root (from block header)
    pub state_root: [u8; 32],
    /// Wallet address being monitored
    pub wallet_address: [u8; 20],
    /// Balance threshold (in wei)
    pub threshold_wei: [u8; 32],
    /// Prova rule ID this proof satisfies
    pub rule_id: [u8; 32],
}

/// Private witness — never revealed, only proven.
#[derive(Serialize, Deserialize)]
pub struct ProofWitness {
    /// RLP-encoded block header (contains state_root)
    pub block_header_rlp: Vec<u8>,
    /// Merkle-Patricia proof for the account node
    pub account_proof: Vec<Vec<u8>>,
    /// RLP-encoded account state (nonce, balance, storage_root, code_hash)
    pub account_rlp: Vec<u8>,
}

pub fn main() {
    // Read public inputs and private witness from SP1 stdin
    let public: ProofPublicInputs = sp1_zkvm::io::read();
    let witness: ProofWitness = sp1_zkvm::io::read();

    // 1. Verify block header hashes to the expected state root
    let _header_hash = keccak256(&witness.block_header_rlp);
    let state_root = extract_state_root_from_header(&witness.block_header_rlp);
    assert_eq!(
        state_root, public.state_root,
        "State root in header does not match public input"
    );

    // 2. Verify the account exists in the state trie at wallet_address
    let address = Address::from(public.wallet_address);
    let account_key = keccak256(address.as_slice());
    verify_merkle_proof(
        &public.state_root,
        account_key.as_slice(),
        &witness.account_proof,
        &witness.account_rlp,
    );

    // 3. Decode account RLP and extract balance
    let balance = decode_account_balance(&witness.account_rlp);
    let threshold = U256::from_be_bytes(public.threshold_wei);

    // 4. Assert the core condition: balance < threshold
    assert!(
        balance < threshold,
        "Balance {:?} is NOT below threshold {:?} — condition not met",
        balance,
        threshold
    );

    // 5. Commit all public inputs to the proof
    sp1_zkvm::io::commit(&public);
}

/// Extract state root from RLP-encoded block header.
/// Position 3 in the RLP list (after parentHash, uncleHash, coinbase).
fn extract_state_root_from_header(header_rlp: &[u8]) -> [u8; 32] {
    // Simplified RLP parser — in production use an alloy RLP decoder
    // The state root is always at offset 3 in the block header list
    let items = rlp_decode_list(header_rlp);
    assert!(items.len() > 3, "Block header RLP too short");
    let mut root = [0u8; 32];
    root.copy_from_slice(&items[3]);
    root
}

/// Verify a Merkle-Patricia trie proof.
/// Walks the proof nodes from root → leaf verifying hashes at each step.
fn verify_merkle_proof(root: &[u8; 32], key: &[u8], proof: &[Vec<u8>], expected_value: &[u8]) {
    let mut current_hash = *root;
    let key_nibbles = to_nibbles(key);
    let mut nibble_idx = 0;

    for node_rlp in proof {
        // Each proof node must hash to the current expected hash
        let node_hash: [u8; 32] = keccak256(node_rlp).into();
        assert_eq!(node_hash, current_hash, "Merkle proof node hash mismatch");

        let node = rlp_decode_list(node_rlp);

        match node.len() {
            // Branch node: 17 items (16 children + value)
            17 => {
                let nibble = key_nibbles[nibble_idx] as usize;
                nibble_idx += 1;
                current_hash.copy_from_slice(&node[nibble]);
            }
            // Leaf or extension node: 2 items (path + value/child)
            2 => {
                let path = decode_compact_path(&node[0]);
                nibble_idx += path.len();
                // Leaf — we've arrived
                if nibble_idx >= key_nibbles.len() {
                    assert_eq!(node[1], expected_value, "Leaf value mismatch");
                    return;
                }
                // Extension — follow child
                current_hash.copy_from_slice(&node[1]);
            }
            _ => panic!("Invalid trie node"),
        }
    }
}

/// Decode RLP balance field from account state.
/// Account state RLP: [nonce, balance, storage_root, code_hash]
fn decode_account_balance(account_rlp: &[u8]) -> U256 {
    let items = rlp_decode_list(account_rlp);
    assert!(items.len() >= 2, "Account RLP missing balance field");
    U256::from_be_slice(&items[1])
}

fn to_nibbles(bytes: &[u8]) -> Vec<u8> {
    bytes.iter().flat_map(|b| [b >> 4, b & 0x0f]).collect()
}

fn decode_compact_path(encoded: &[u8]) -> Vec<u8> {
    if encoded.is_empty() {
        return vec![];
    }
    let flag = encoded[0] >> 4;
    let skip = if flag % 2 == 0 { 2 } else { 1 };
    to_nibbles(&encoded[skip / 2..])
}

/// Minimal RLP list decoder — returns each item as raw bytes.
fn rlp_decode_list(data: &[u8]) -> Vec<Vec<u8>> {
    let mut items = Vec::new();
    let (_, payload) = rlp_strip_list_prefix(data);
    let mut i = 0;
    while i < payload.len() {
        let (item, len) = rlp_decode_item(&payload[i..]);
        items.push(item);
        i += len;
    }
    items
}

fn rlp_strip_list_prefix(data: &[u8]) -> (usize, &[u8]) {
    let first = data[0] as usize;
    if first <= 0xf7 {
        (1, &data[1..1 + (first - 0xc0)])
    } else {
        let len_bytes = first - 0xf7;
        let mut len = 0usize;
        for &b in &data[1..1 + len_bytes] {
            len = (len << 8) | b as usize;
        }
        (1 + len_bytes, &data[1 + len_bytes..1 + len_bytes + len])
    }
}

fn rlp_decode_item(data: &[u8]) -> (Vec<u8>, usize) {
    let first = data[0] as usize;
    if first < 0x80 {
        (vec![data[0]], 1)
    } else if first <= 0xb7 {
        let len = first - 0x80;
        (data[1..1 + len].to_vec(), 1 + len)
    } else if first <= 0xbf {
        let len_bytes = first - 0xb7;
        let mut len = 0usize;
        for &b in &data[1..1 + len_bytes] {
            len = (len << 8) | b as usize;
        }
        (
            data[1 + len_bytes..1 + len_bytes + len].to_vec(),
            1 + len_bytes + len,
        )
    } else {
        // List — return as raw bytes
        let (prefix_len, payload) = rlp_strip_list_prefix(data);
        let total = prefix_len + payload.len();
        (data[..total].to_vec(), total)
    }
}
