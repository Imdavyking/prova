//! programs/prova_executor/src/lib.rs
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use sp1_solana::{verify_proof, GROTH16_VK_2_0_0_BYTES};

declare_id!("5tNGoxGxNUWuTuToeCwNXBPtNNBWdjrwCAq2abTakwKt");

// ─── Constants ────────────────────────────────────────────────────────────────

/// SP1 verification key hash for the balance_prover circuit.
/// Replace with the output of `cargo prove vk` after building sp1-prover/program.
pub const BALANCE_PROVER_VK_HASH: &str =
    "0x0011223344556677889900112233445566778899001122334455667788990011";

/// Computation definition offset for execute_transfer.
/// Replace with: Buffer.from(getCompDefAccOffset("execute_transfer")).readUInt32LE()
pub const COMP_DEF_OFFSET_EXECUTE_TRANSFER: u32 = comp_def_offset("execute_transfer");

pub const VAULT_SEED: &[u8] = b"prova_vault";
pub const PENDING_SEED: &[u8] = b"pending_exec";

// ─── Public proof inputs ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BalanceProofPublicInputs {
    pub block_number: u64,
    pub state_root: [u8; 32],
    pub wallet_address: [u8; 20],
    pub threshold_wei: [u8; 32],
    pub rule_id: [u8; 32],
}

// ─── State ────────────────────────────────────────────────────────────────────

/// Stores rule data between submit_proof and the Arcium callback.
#[account]
pub struct PendingExecution {
    pub rule_id: [u8; 32],
    pub recipient: Pubkey,
    pub token_mint: Pubkey,
    pub action_amount: u64,
    pub fee_payer: Pubkey,
    pub bump: u8,
}

impl PendingExecution {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 32 + 1;
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ProofVerified {
    pub rule_id: [u8; 32],
    pub block_number: u64,
}

#[event]
pub struct TransferExecuted {
    pub rule_id: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum ExecutorError {
    #[msg("SP1 proof verification failed")]
    InvalidProof,
    #[msg("Proof public inputs do not match rule")]
    PublicInputMismatch,
    #[msg("Arcium computation aborted")]
    AbortedComputation,
    #[msg("Vault has insufficient balance")]
    InsufficientVaultBalance,
}

// ─── Output type (matches execute_transfer Arcis circuit) ────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ExecuteTransferOutput {
    pub approved: u64,
}

// ─── Program ─────────────────────────────────────────────────────────────────

#[arcium_program]
pub mod prova_executor {
    use super::*;

    /// Initialize: register the execute_transfer computation definition with Arcium.
    pub fn init_execute_transfer_comp_def(ctx: Context<InitExecuteTransferCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Main entry point — called by the off-chain monitor.
    ///
    /// 1. Verifies the SP1 Groth16 proof on-chain
    /// 2. Checks public inputs match the rule (passed as params)
    /// 3. Stores pending execution state
    /// 4. Queues Arcium MXE computation
    pub fn submit_proof_and_execute(
        ctx: Context<SubmitProofAndExecute>,
        // SP1 proof
        proof_bytes: Vec<u8>,
        public_values: Vec<u8>, // serialized BalanceProofPublicInputs
        public_inputs: BalanceProofPublicInputs,
        // Rule data passed from monitor (matches registry account)
        rule_watch_address: [u8; 20],
        rule_threshold_wei: [u8; 32],
        rule_recipient: Pubkey,
        rule_token_mint: Pubkey,
        rule_action_amount: u64,
        // Arcium
        computation_offset: u64,
        ciphertext_amount: [u8; 32],
        ciphertext_recipient: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        // ── 1. Verify SP1 proof ───────────────────────────────────────────────
        verify_proof(
            &proof_bytes,
            &public_values,
            BALANCE_PROVER_VK_HASH,
            GROTH16_VK_2_0_0_BYTES,
        )
        .map_err(|_| ExecutorError::InvalidProof)?;

        // ── 2. Match public inputs against rule params ────────────────────────
        require!(
            public_inputs.wallet_address == rule_watch_address,
            ExecutorError::PublicInputMismatch
        );
        require!(
            public_inputs.threshold_wei == rule_threshold_wei,
            ExecutorError::PublicInputMismatch
        );

        emit!(ProofVerified {
            rule_id: public_inputs.rule_id,
            block_number: public_inputs.block_number,
        });

        // ── 3. Store pending execution ────────────────────────────────────────
        let pending = &mut ctx.accounts.pending_execution;
        pending.rule_id = public_inputs.rule_id;
        pending.recipient = rule_recipient;
        pending.token_mint = rule_token_mint;
        pending.action_amount = rule_action_amount;
        pending.fee_payer = ctx.accounts.fee_payer.key();
        pending.bump = ctx.bumps.pending_execution;

        // ── 4. Queue Arcium MXE computation ──────────────────────────────────
        // Args mirror the execute_transfer Arcis circuit:
        //   (ArcisPubkey, PlaintextU128 nonce, EncryptedU64 amount, EncryptedU64 recipient_tag)
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(ciphertext_amount),
            Argument::EncryptedU64(ciphertext_recipient),
        ];

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Derive the pending execution PDA address to pass as callback account
        let pending_pda = ctx.accounts.pending_execution.key();
        let vault_pda = ctx.accounts.vault_token_account.key();
        let recipient_ata = ctx.accounts.recipient_token_account.key();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ExecuteTransferCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    CallbackAccount {
                        pubkey: pending_pda,
                        is_writable: true,
                    },
                    CallbackAccount {
                        pubkey: vault_pda,
                        is_writable: true,
                    },
                    CallbackAccount {
                        pubkey: recipient_ata,
                        is_writable: true,
                    },
                ],
            )?],
            1,
            5_000,
        )?;

        Ok(())
    }

    /// Arcium callback — called by the MPC cluster after confidential execution.
    /// Performs the actual SPL transfer once the MXE approves.
    #[arcium_callback(encrypted_ix = "execute_transfer")]
    pub fn execute_transfer_callback(
        ctx: Context<ExecuteTransferCallback>,
        output: SignedComputationOutputs<ExecuteTransferOutput>,
    ) -> Result<()> {
        // Verify MPC computation succeeded and approved the transfer
        let result = match output {
            ComputationOutputs::Success(out) => out,
            _ => return Err(ExecutorError::AbortedComputation.into()),
        };

        // approved == 1 means all constraints passed inside the Arcis circuit
        require!(result.approved == 1, ExecutorError::AbortedComputation);

        let pending = &ctx.accounts.pending_execution;

        require!(
            ctx.accounts.vault_token_account.amount >= pending.action_amount,
            ExecutorError::InsufficientVaultBalance
        );

        // Sign as vault authority PDA
        let vault_bump = ctx.bumps.vault_authority;
        let seeds: &[&[u8]] = &[VAULT_SEED, &[vault_bump]];
        let signer = &[seeds];

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
        });

        msg!(
            "Transfer executed: {} tokens → {}",
            pending.action_amount,
            pending.recipient,
        );

        Ok(())
    }
}

// ─── Account contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitExecuteTransferCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        init,
        payer = payer,
        space = ComputationDefinitionAccount::SIZE,
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_EXECUTE_TRANSFER),
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_cluster_pda!(mxe_account, ExecutorError::AbortedComputation))]
    pub cluster_account: Account<'info, Cluster>,
}
#[queue_computation_accounts("execute_transfer", fee_payer)]
#[derive(Accounts)]
#[instruction(
    proof_bytes:        Vec<u8>,
    public_values:      Vec<u8>,
    public_inputs:      BalanceProofPublicInputs,
    rule_watch_address: [u8; 20],
    rule_threshold_wei: [u8; 32],
    rule_recipient:     Pubkey,
    rule_token_mint:    Pubkey,
    rule_action_amount: u64,
    computation_offset: u64,
)]
pub struct SubmitProofAndExecute<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    #[account(
        init,
        payer = fee_payer,
        space = PendingExecution::LEN,
        seeds = [PENDING_SEED, &public_inputs.rule_id],
        bump,
    )]
    pub pending_execution: Account<'info, PendingExecution>,

    #[account(
        mut,
        seeds = [VAULT_SEED, rule_token_mint.key().as_ref()],
        bump,
        token::mint      = rule_token_mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: PDA that signs vault transfers
    #[account(seeds = [VAULT_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub rule_token_mint: Account<'info, anchor_spl::token::Mint>,

    // ── Arcium required accounts ──────────────────────────────────────────
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
    /// CHECK: verified by Arcium
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ExecutorError::AbortedComputation)
    )]
    /// CHECK: verified by Arcium
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ExecutorError::AbortedComputation)
    )]
    /// CHECK: verified by Arcium
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_EXECUTE_TRANSFER))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ExecutorError::AbortedComputation)
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
    // ── Standard Arcium callback accounts (required first 3) ─────────────
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_EXECUTE_TRANSFER))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    pub computation_account: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    // ── Custom accounts passed via CallbackAccount in queue_computation ───
    #[account(
        mut,
        seeds = [PENDING_SEED, &pending_execution.rule_id],
        bump  = pending_execution.bump,
    )]
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
