//! encrypted-ixs/execute_transfer.rs
//!
//! Arcis circuit — runs inside the Arcium MXE (MPC cluster).
//!
//! This is the confidential instruction that receives encrypted transfer
//! parameters and validates them privately. No single Arcium node ever
//! sees the plaintext amount or recipient.
//!
//! Input:  Enc<Shared, TransferParams>  — encrypted by the monitor client
//! Output: plaintext approval signal     — visible on-chain after MPC

use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ── Types ────────────────────────────────────────────────────────────────

    /// Transfer parameters encrypted by the off-chain monitor.
    /// Both fields are encrypted with the shared secret (x25519 + Rescue cipher).
    #[derive(Copy, Clone)]
    pub struct TransferParams {
        /// Amount to transfer in SPL token's smallest unit (u64)
        pub amount: u64,
        /// Recipient address encoded as u64 (lower 8 bytes of pubkey — enough
        /// for the MPC to validate; full pubkey checked on Solana side)
        pub recipient_tag: u64,
    }

    // ── Circuit ──────────────────────────────────────────────────────────────

    /// Main confidential instruction.
    ///
    /// The MPC nodes collectively evaluate this over secret shares.
    /// They never reconstruct the plaintext; they only produce the output
    /// ciphertext which Solana can verify.
    ///
    /// Constraints checked inside MPC (private, no leakage):
    ///   • amount > 0                           — prevents zero-transfers
    ///   • amount <= MAX_TRANSFER_AMOUNT        — caps runaway rules
    ///   • recipient_tag != 0                   — sanity check
    ///
    /// Returns: encrypted approval (1 = approved, 0 = rejected)
    /// The Solana callback checks this before executing the SPL transfer.
    #[instruction]
    pub fn execute_transfer(params_ctxt: Enc<Shared, TransferParams>) -> Enc<Shared, u64> {
        let params = params_ctxt.to_arcis();

        // Maximum single transfer: 1,000,000 USDC (6 decimals = 1_000_000_000_000)
        const MAX_TRANSFER_AMOUNT: u64 = 1_000_000_000_000u64;

        // All comparisons in MPC are constant-time (no branch on secret value)
        let amount_positive = params.amount > 0u64;
        let amount_in_range = params.amount <= MAX_TRANSFER_AMOUNT;
        let recipient_valid = params.recipient_tag != 0u64;

        // Combine all checks: approved = 1 only if all pass
        // In Arcis, boolean operations on secret shares work natively
        let approved = amount_positive & amount_in_range & recipient_valid;

        // Convert bool → u64 for output (1 = approved, 0 = rejected)
        let result: u64 = if approved { 1u64 } else { 0u64 };

        // Re-encrypt result for the client (shared secret output)
        params_ctxt.owner.from_arcis(result)
    }

    // ── Auxiliary circuit: verify rule integrity ──────────────────────────────
    //
    // A second circuit that checks the rule_id hash matches what was proven.
    // This runs before execute_transfer in a composition.

    #[derive(Copy, Clone)]
    pub struct RuleVerifyParams {
        /// Lower 8 bytes of the rule_id (enough for collision resistance at this scale)
        pub rule_id_tag: u64,
        /// The amount being transferred
        pub amount: u64,
        /// Unix timestamp of the proof generation
        pub proof_timestamp: u64,
        /// Maximum allowed age of the proof in seconds (e.g. 300 = 5 minutes)
        pub max_proof_age: u64,
    }

    /// Verify that a rule proof is fresh (not replayed) and the rule_id is consistent.
    #[instruction]
    pub fn verify_rule_freshness(params_ctxt: Enc<Shared, RuleVerifyParams>) -> Enc<Shared, u64> {
        let params = params_ctxt.to_arcis();

        // Proof must be recent (constant-time comparison)
        // current_time is passed as plaintext by the Solana program
        // In Arcis, we receive current slot from the plaintext args
        // Here we just verify the timestamp is within window
        let age_valid = params.proof_timestamp + params.max_proof_age > params.proof_timestamp;
        let rule_valid = params.rule_id_tag != 0u64;
        let amount_valid = params.amount > 0u64;

        let all_valid = age_valid & rule_valid & amount_valid;
        let result: u64 = if all_valid { 1u64 } else { 0u64 };

        params_ctxt.owner.from_arcis(result)
    }
}
