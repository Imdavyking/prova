//! programs/prova_executor/src/lib.rs
//!
//! Prova Executor — Arcium MXE program.
//!
//! Responsibilities:
//!   1. Accept a SP1 Groth16 proof from the off-chain monitor
//!   2. Verify it on-chain using sp1-solana (BN254 precompiles)
//!   3. Queue a confidential Arcium computation to execute the transfer
//!      privately via the Arcis `execute_transfer` circuit
//!   4. In the callback, perform the actual SPL token transfer and
//!      CPI back to the registry to mark the rule executed

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use sp1_solana::verify_proof;

declare_id!("EXECpRoVaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

// ─── Constants ───────────────────────────────────────────────────────────────

/// SP1 verification key hash for the balance_prover circuit.
/// Generated with `cargo prove build` then `cargo prove vk`.
/// Replace with actual vk after building the SP1 program.
pub const BALANCE_PROVER_VK_HASH: &[u8; 32] = &[
    0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
];

/// Arcium computation definition offset for `execute_transfer` circuit.
/// Computed as `comp_def_offset("execute_transfer")`.
pub const COMP_DEF_OFFSET_EXECUTE_TRANSFER: u32 = comp_def_offset("execute_transfer");

/// Seed for the executor vault PDA (holds USDC/SPL for payouts)
pub const VAULT_SEED: &[u8] = b"prova_vault";

// ─── Public proof inputs (match the SP1 prover program exactly) ──────────────

/// Deserialized from the SP1 proof's public values output.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BalanceProofPublicInputs {
    pub block_number: u64,
    pub state_root: [u8; 32],
    pub wallet_address: [u8; 20],
    pub threshold_wei: [u8; 32],
    pub rule_id: [u8; 32],
}

// ─── Pending computation account ─────────────────────────────────────────────
// Stores state between the submit_proof call and the Arcium callback.

#[account]
pub struct PendingExecution {
    /// The rule this execution is for
    pub rule_id: [u8; 32],
    /// Solana recipient pubkey
    pub recipient: Pubkey,
    /// SPL token mint
    pub token_mint: Pubkey,
    /// Amount to transfer
    pub action_amount: u64,
    /// Who gets the executor fee
    pub fee_payer: Pubkey,
    /// Arcium computation_offset (random, used to derive computation PDA)
    pub computation_offset: u64,
    pub bump: u8,
}

impl PendingExecution {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 32 + 8 + 1;
    pub const SEED: &'static [u8] = b"pending_exec";
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ProofVerified {
    pub rule_id: [u8; 32],
    pub block_number: u64,
    pub state_root: [u8; 32],
}

#[event]
pub struct TransferExecuted {
    pub rule_id: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum ExecutorError {
    #[msg("SP1 proof verification failed")]
    InvalidProof,
    #[msg("Proof public inputs do not match registered rule")]
    PublicInputMismatch,
    #[msg("Arcium computation output invalid")]
    AbortedComputation,
    #[msg("Vault has insufficient balance")]
    InsufficientVaultBalance,
    #[msg("Arithmetic overflow")]
    Overflow,
}

// ─── Program ─────────────────────────────────────────────────────────────────

#[arcium_program]
pub mod prova_executor {
    use super::*;

    /// Initialize the executor: set up the vault token account and
    /// register the `execute_transfer` computation definition with Arcium.
    pub fn initialize_executor(ctx: Context<InitializeExecutor>) -> Result<()> {
        msg!("Prova executor initialized");
        Ok(())
    }

    /// Register the execute_transfer computation definition with Arcium.
    /// Called once after deploy.
    pub fn init_execute_transfer_comp_def(ctx: Context<InitExecuteTransferCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Main entry point: called by the off-chain monitor with the SP1 proof.
    ///
    /// Steps:
    ///   1. Verify the Groth16 proof on-chain
    ///   2. Check public inputs match the registered rule
    ///   3. Store pending execution state
    ///   4. Queue Arcium MXE computation
    pub fn submit_proof_and_execute(
        ctx: Context<SubmitProofAndExecute>,
        // Raw Groth16 proof bytes from SP1
        proof_bytes: Vec<u8>,
        // Decoded public inputs (monitor parsed them from proof)
        public_inputs: BalanceProofPublicInputs,
        // Random offset for the Arcium computation account
        computation_offset: u64,
        // Encrypted transfer params for Arcium MXE (x25519 key exchange)
        encrypted_amount: [u8; 32],
        encrypted_recipient: [u8; 32],
        mxe_pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        // ── Step 1: Verify the SP1 Groth16 proof on-chain ──────────────────
        // sp1_solana::verify_proof uses Solana's BN254 precompiles (~280k CU)
        verify_proof(&proof_bytes, BALANCE_PROVER_VK_HASH)
            .map_err(|_| ExecutorError::InvalidProof)?;

        msg!("SP1 proof verified for rule {:?}", public_inputs.rule_id);

        // ── Step 2: Match public inputs against the registered rule ─────────
        let rule = &ctx.accounts.rule;
        require!(
            rule.rule_id == public_inputs.rule_id,
            ExecutorError::PublicInputMismatch
        );
        require!(
            rule.watch_address == public_inputs.wallet_address,
            ExecutorError::PublicInputMismatch
        );
        require!(
            rule.threshold_wei == public_inputs.threshold_wei,
            ExecutorError::PublicInputMismatch
        );

        emit!(ProofVerified {
            rule_id: public_inputs.rule_id,
            block_number: public_inputs.block_number,
            state_root: public_inputs.state_root,
        });

        // ── Step 3: Store pending execution for the callback ────────────────
        let pending = &mut ctx.accounts.pending_execution;
        pending.rule_id = rule.rule_id;
        pending.recipient = rule.recipient;
        pending.token_mint = rule.token_mint;
        pending.action_amount = rule.action_amount;
        pending.fee_payer = ctx.accounts.fee_payer.key();
        pending.computation_offset = computation_offset;
        pending.bump = ctx.bumps.pending_execution;

        // ── Step 4: Queue the Arcium MXE confidential computation ───────────
        // The circuit receives encrypted (amount, recipient) and performs
        // the transfer privately — no node sees plaintext values.
        let args = ArgBuilder::new()
            .x25519_pubkey(mxe_pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(encrypted_amount)
            .encrypted_u64(encrypted_recipient)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ExecuteTransferCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    // Pass through the pending_execution and vault accounts
                    // so the callback can access them
                    ctx.accounts.pending_execution.to_account_info().key(),
                    ctx.accounts.vault_token_account.to_account_info().key(),
                    ctx.accounts.recipient_token_account.to_account_info().key(),
                ],
            )?],
            1,
            5_000, // priority fee microlamports
        )?;

        Ok(())
    }

    /// Arcium callback — called by MPC cluster after confidential computation.
    ///
    /// At this point, the MXE has validated the transfer parameters privately.
    /// We perform the actual SPL token transfer here.
    #[arcium_callback(encrypted_ix = "execute_transfer")]
    pub fn execute_transfer_callback(
        ctx: Context<ExecuteTransferCallback>,
        output: SignedComputationOutputs<ExecuteTransferOutput>,
    ) -> Result<()> {
        // Verify the computation output from the Arcium cluster
        let _result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(out) => out,
            Err(e) => {
                msg!("Arcium computation error: {}", e);
                return Err(ExecutorError::AbortedComputation.into());
            }
        };

        let pending = &ctx.accounts.pending_execution;

        // Sanity-check vault balance before transfer
        require!(
            ctx.accounts.vault_token_account.amount >= pending.action_amount,
            ExecutorError::InsufficientVaultBalance
        );

        // Perform the SPL transfer: vault → recipient
        let vault_seeds: &[&[u8]] = &[VAULT_SEED, &[ctx.bumps.vault_authority]];
        let signer = &[vault_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer,
            ),
            pending.action_amount,
        )?;

        emit!(TransferExecuted {
            rule_id: pending.rule_id,
            recipient: pending.recipient,
            amount: pending.action_amount,
            token_mint: pending.token_mint,
        });

        msg!(
            "Transfer executed: {} tokens → {} for rule {:?}",
            pending.action_amount,
            pending.recipient,
            pending.rule_id,
        );

        // CPI to registry to mark rule as executed
        // (uses a cross-program invocation to prova_registry::mark_executed)
        // Omitted for brevity — add registry CPI here in production

        Ok(())
    }
}

// ─── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeExecutor<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[queue_computation_accounts("execute_transfer", fee_payer)]
#[derive(Accounts)]
#[instruction(
    proof_bytes: Vec<u8>,
    public_inputs: BalanceProofPublicInputs,
    computation_offset: u64,
)]
pub struct SubmitProofAndExecute<'info> {
    // ── Fee payer (the off-chain monitor's keypair) ───────────────────────
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    // ── The rule account from prova_registry ─────────────────────────────
    /// CHECK: We verify rule fields against public_inputs manually
    pub rule: AccountInfo<'info>,

    // ── Pending execution state (created here, consumed in callback) ──────
    #[account(
        init,
        payer = fee_payer,
        space = PendingExecution::LEN,
        seeds = [PendingExecution::SEED, &public_inputs.rule_id],
        bump,
    )]
    pub pending_execution: Account<'info, PendingExecution>,

    // ── Vault token account (holds SPL tokens for payouts) ────────────────
    #[account(
        mut,
        seeds = [VAULT_SEED, token_mint.key().as_ref()],
        bump,
        token::mint      = token_mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: PDA that signs vault transfers
    #[account(seeds = [VAULT_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// Recipient token account (must exist, owned by recipient)
    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, anchor_spl::token::Mint>,

    // ── Arcium required accounts (boilerplate) ────────────────────────────
    #[account(
        init_if_needed,
        space = 9,
        payer = fee_payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ExecutorError::AbortedComputation)
    )]
    /// CHECK: verified by arcium program
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ExecutorError::AbortedComputation)
    )]
    /// CHECK: verified by arcium program
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ExecutorError::AbortedComputation)
    )]
    /// CHECK: verified by arcium program
    pub computation_account: UncheckedAccount<'info>,

    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_EXECUTE_TRANSFER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ExecutorError::AbortedComputation)
    )]
    pub cluster_account: Account<'info, Cluster>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("execute_transfer")]
#[derive(Accounts)]
pub struct ExecuteTransferCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_EXECUTE_TRANSFER))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    /// CHECK: verified by arcium
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_cluster_pda!(mxe_account, ExecutorError::AbortedComputation))]
    pub cluster_account: Account<'info, Cluster>,

    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,

    // ── Extra accounts passed through from submit_proof_and_execute ───────
    #[account(mut, seeds = [PendingExecution::SEED, &pending_execution.rule_id], bump = pending_execution.bump)]
    pub pending_execution: Account<'info, PendingExecution>,

    #[account(
        mut,
        seeds = [VAULT_SEED, pending_execution.token_mint.as_ref()],
        bump,
        token::mint      = pending_execution.token_mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: PDA vault signer
    #[account(seeds = [VAULT_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// InitExecuteTransferCompDef — boilerplate, generated by `arcium init`
#[derive(Accounts)]
pub struct InitExecuteTransferCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mxe_account: Account<'info, MXEAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        mut,
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_EXECUTE_TRANSFER)
    )]
    /// CHECK: initialized by arcium
    pub comp_def_account: UncheckedAccount<'info>,
    pub cluster_account: Account<'info, Cluster>,
}
