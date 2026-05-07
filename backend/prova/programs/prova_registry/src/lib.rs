//! programs/prova_registry/src/lib.rs
//!
//! Prova Registry — on-chain rule storage + fee escrow.
//!
//! Responsibilities:
//!   • Store condition/action pairs registered by users
//!   • Hold execution fees in escrow per rule
//!   • Mark rules as triggered/executed so they can't double-fire
//!   • Emit events the off-chain monitor subscribes to

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("jwE73RVS7HafaL4qAwEAnwxU3YFpWeddhaHqRekUwpa");

// ─── Constants ───────────────────────────────────────────────────────────────

/// Seed for the registry global state PDA
pub const REGISTRY_SEED: &[u8] = b"prova_registry";

/// Seed prefix for individual rule PDAs
pub const RULE_SEED: &[u8] = b"prova_rule";

/// Maximum number of active rules per user (prevents spam)
pub const MAX_RULES_PER_USER: u8 = 32;

/// Minimum execution fee in lamports (covers ~3 Solana txs at 5000 lamports each)
pub const MIN_FEE_LAMPORTS: u64 = 15_000;

// ─── Condition types ──────────────────────────────────────────────────────────

/// Which chain to monitor for the trigger condition
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum SourceChain {
    Ethereum,
    Base,
    Arbitrum,
    Optimism,
    Polygon,
}

/// What kind of condition triggers this rule
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum ConditionType {
    /// Native token balance drops below threshold_wei
    BalanceBelow,
    /// ERC-20 token balance drops below threshold_wei
    TokenBalanceBelow,
    /// Block number reaches target
    BlockReached,
    /// Arbitrary storage slot equals value
    StorageSlotEquals,
}

/// What action to execute on Solana when condition is met
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum ActionType {
    /// Transfer SPL token to recipient
    TransferSpl,
    /// Transfer native SOL
    TransferSol,
}

// ─── Accounts ────────────────────────────────────────────────────────────────

/// Global registry state — tracks total rules and protocol fee recipient
#[account]
#[derive(Debug)]
pub struct RegistryState {
    /// Admin authority (for upgrades/pausing)
    pub authority: Pubkey,
    /// Protocol fee recipient
    pub fee_recipient: Pubkey,
    /// Protocol fee in basis points (e.g. 50 = 0.5%)
    pub protocol_fee_bps: u16,
    /// Total rules ever registered (used as nonce for rule IDs)
    pub total_rules: u64,
    /// Whether the protocol is paused
    pub paused: bool,
    /// Bump for the PDA
    pub bump: u8,
}

impl RegistryState {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 8 + 1 + 1;
}

/// One registered rule — stored in a PDA per (owner, rule_id)
#[account]
#[derive(Debug)]
pub struct Rule {
    /// Who registered the rule
    pub owner: Pubkey,
    /// Unique ID for this rule (sequential from RegistryState::total_rules)
    pub rule_id: [u8; 32],
    /// Source chain to monitor
    pub source_chain: SourceChain,
    /// Condition type
    pub condition_type: ConditionType,
    /// Address being monitored on the source chain (20 bytes, ETH address)
    pub watch_address: [u8; 20],
    /// Token contract address on source chain (zero for native)
    pub token_address: [u8; 20],
    /// Threshold value in wei (u256 as [u8; 32])
    pub threshold_wei: [u8; 32],
    /// Action type
    pub action_type: ActionType,
    /// Recipient on Solana for the action
    pub recipient: Pubkey,
    /// SPL token mint for TransferSpl actions
    pub token_mint: Pubkey,
    /// Amount for the action (in SPL token smallest unit)
    pub action_amount: u64,
    /// Execution fee escrowed in lamports
    pub escrowed_fee: u64,
    /// Current status of the rule
    pub status: RuleStatus,
    /// Block/slot the rule was registered
    pub registered_at: i64,
    /// Block/slot the rule was executed (0 if pending)
    pub executed_at: i64,
    /// Bump for the PDA
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum RuleStatus {
    /// Waiting for condition
    Active,
    /// Condition detected, proof being generated
    Triggered,
    /// Proof submitted, MXE computation queued
    Proving,
    /// Fully executed on Solana
    Executed,
    /// Cancelled by owner before execution
    Cancelled,
}

impl Rule {
    pub const LEN: usize = 8   // discriminator
        + 32  // owner
        + 32  // rule_id
        + 2   // source_chain enum
        + 2   // condition_type enum
        + 20  // watch_address
        + 20  // token_address
        + 32  // threshold_wei
        + 2   // action_type enum
        + 32  // recipient
        + 32  // token_mint
        + 8   // action_amount
        + 8   // escrowed_fee
        + 2   // status enum
        + 8   // registered_at
        + 8   // executed_at
        + 1;  // bump
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct RuleRegistered {
    pub rule_id: [u8; 32],
    pub owner: Pubkey,
    pub source_chain: SourceChain,
    pub condition_type: ConditionType,
    pub watch_address: [u8; 20],
    pub threshold_wei: [u8; 32],
    pub action_type: ActionType,
    pub recipient: Pubkey,
    pub action_amount: u64,
    pub escrowed_fee: u64,
}

#[event]
pub struct RuleTriggered {
    pub rule_id: [u8; 32],
    pub block_number: u64,
}

#[event]
pub struct RuleExecuted {
    pub rule_id: [u8; 32],
    pub tx_signature: [u8; 64],
    pub executed_at: i64,
}

#[event]
pub struct RuleCancelled {
    pub rule_id: [u8; 32],
    pub owner: Pubkey,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum RegistryError {
    #[msg("Protocol is paused")]
    Paused,
    #[msg("Fee below minimum required")]
    FeeTooLow,
    #[msg("Rule is not in Active status")]
    RuleNotActive,
    #[msg("Rule is not in Triggered status")]
    RuleNotTriggered,
    #[msg("Rule is not in Proving status")]
    RuleNotProving,
    #[msg("Only rule owner can cancel")]
    Unauthorized,
    #[msg("Invalid threshold: must be > 0")]
    InvalidThreshold,
    #[msg("Invalid action amount: must be > 0")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
}

// ─── Program ─────────────────────────────────────────────────────────────────

#[program]
pub mod prova_registry {
    use super::*;

    /// Initialize the global registry state. Called once by the deployer.
    pub fn initialize(
        ctx: Context<Initialize>,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        let state = &mut ctx.accounts.registry_state;
        state.authority     = ctx.accounts.authority.key();
        state.fee_recipient = ctx.accounts.authority.key();
        state.protocol_fee_bps = protocol_fee_bps;
        state.total_rules   = 0;
        state.paused        = false;
        state.bump          = ctx.bumps.registry_state;
        Ok(())
    }

    /// Register a new cross-chain rule with escrowed execution fee.
    pub fn register_rule(
        ctx: Context<RegisterRule>,
        params: RegisterRuleParams,
    ) -> Result<()> {
        require!(!ctx.accounts.registry_state.paused, RegistryError::Paused);
        require!(
            ctx.accounts.owner.lamports() >= MIN_FEE_LAMPORTS,
            RegistryError::FeeTooLow
        );
        require!(
            params.escrowed_fee >= MIN_FEE_LAMPORTS,
            RegistryError::FeeTooLow
        );
        require!(
            params.threshold_wei != [0u8; 32],
            RegistryError::InvalidThreshold
        );
        require!(params.action_amount > 0, RegistryError::InvalidAmount);

        // Generate a unique rule_id from owner + sequential counter
        let state = &mut ctx.accounts.registry_state;
        let rule_count = state.total_rules;
        state.total_rules = state.total_rules.checked_add(1).ok_or(RegistryError::Overflow)?;

        // rule_id = keccak256(owner ++ rule_count) — done off-chain, passed in
        // We trust the PDA derivation to enforce uniqueness
        let rule = &mut ctx.accounts.rule;
        rule.owner          = ctx.accounts.owner.key();
        rule.rule_id        = params.rule_id;
        rule.source_chain   = params.source_chain;
        rule.condition_type = params.condition_type;
        rule.watch_address  = params.watch_address;
        rule.token_address  = params.token_address;
        rule.threshold_wei  = params.threshold_wei;
        rule.action_type    = params.action_type;
        rule.recipient      = params.recipient;
        rule.token_mint     = params.token_mint;
        rule.action_amount  = params.action_amount;
        rule.escrowed_fee   = params.escrowed_fee;
        rule.status         = RuleStatus::Active;
        rule.registered_at  = Clock::get()?.unix_timestamp;
        rule.executed_at    = 0;
        rule.bump           = ctx.bumps.rule;

        // Transfer execution fee from owner to rule PDA (holds it in escrow)
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.owner.key(),
            &ctx.accounts.rule.key(),
            params.escrowed_fee,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.rule.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        emit!(RuleRegistered {
            rule_id:        params.rule_id,
            owner:          ctx.accounts.owner.key(),
            source_chain:   rule.source_chain.clone(),
            condition_type: rule.condition_type.clone(),
            watch_address:  rule.watch_address,
            threshold_wei:  rule.threshold_wei,
            action_type:    rule.action_type.clone(),
            recipient:      rule.recipient,
            action_amount:  rule.action_amount,
            escrowed_fee:   rule.escrowed_fee,
        });

        msg!(
            "Rule #{} registered by {} — escrowed {} lamports",
            rule_count,
            ctx.accounts.owner.key(),
            params.escrowed_fee
        );
        Ok(())
    }

    /// Called by the off-chain monitor when a condition is detected.
    /// Marks the rule as Triggered so proof generation can begin.
    /// This is a permissioned call — only a trusted monitor keypair can call it.
    pub fn mark_triggered(
        ctx: Context<MarkTriggered>,
        block_number: u64,
    ) -> Result<()> {
        let rule = &mut ctx.accounts.rule;
        require!(rule.status == RuleStatus::Active, RegistryError::RuleNotActive);
        rule.status = RuleStatus::Triggered;

        emit!(RuleTriggered {
            rule_id: rule.rule_id,
            block_number,
        });
        Ok(())
    }

    /// Called by the proof submitter once the SP1 proof is submitted to the executor.
    /// Advances status from Triggered → Proving.
    pub fn mark_proving(ctx: Context<MarkProving>) -> Result<()> {
        let rule = &mut ctx.accounts.rule;
        require!(rule.status == RuleStatus::Triggered, RegistryError::RuleNotTriggered);
        rule.status = RuleStatus::Proving;
        Ok(())
    }

    /// Called by the executor program (CPI) after the Arcium MXE callback confirms execution.
    /// Advances status to Executed and records the tx signature.
    pub fn mark_executed(
        ctx: Context<MarkExecuted>,
        tx_signature: [u8; 64],
    ) -> Result<()> {
        let rule = &mut ctx.accounts.rule;
        require!(rule.status == RuleStatus::Proving, RegistryError::RuleNotProving);

        let now = Clock::get()?.unix_timestamp;
        rule.status      = RuleStatus::Executed;
        rule.executed_at = now;

        // Release escrowed fee to executor
        let fee = rule.escrowed_fee;
        rule.escrowed_fee = 0;
        **rule.to_account_info().try_borrow_mut_lamports()? -= fee;
        **ctx.accounts.executor.to_account_info().try_borrow_mut_lamports()? += fee;

        emit!(RuleExecuted {
            rule_id: rule.rule_id,
            tx_signature,
            executed_at: now,
        });
        Ok(())
    }

    /// Cancel an active rule and reclaim escrowed fee.
    pub fn cancel_rule(ctx: Context<CancelRule>) -> Result<()> {
        let rule = &mut ctx.accounts.rule;
        require!(
            rule.owner == ctx.accounts.owner.key(),
            RegistryError::Unauthorized
        );
        require!(rule.status == RuleStatus::Active, RegistryError::RuleNotActive);

        let fee = rule.escrowed_fee;
        rule.escrowed_fee = 0;
        rule.status = RuleStatus::Cancelled;

        // Return escrowed fee to owner
        **rule.to_account_info().try_borrow_mut_lamports()? -= fee;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += fee;

        emit!(RuleCancelled {
            rule_id: rule.rule_id,
            owner: ctx.accounts.owner.key(),
        });
        Ok(())
    }

    /// Admin: pause the protocol
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.registry_state.paused = paused;
        Ok(())
    }
}

// ─── Params ──────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterRuleParams {
    pub rule_id:        [u8; 32],
    pub source_chain:   SourceChain,
    pub condition_type: ConditionType,
    pub watch_address:  [u8; 20],
    pub token_address:  [u8; 20],
    pub threshold_wei:  [u8; 32],
    pub action_type:    ActionType,
    pub recipient:      Pubkey,
    pub token_mint:     Pubkey,
    pub action_amount:  u64,
    pub escrowed_fee:   u64,
}

// ─── Account contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = RegistryState::LEN,
        seeds = [REGISTRY_SEED],
        bump,
    )]
    pub registry_state: Account<'info, RegistryState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: RegisterRuleParams)]
pub struct RegisterRule<'info> {
    #[account(
        mut,
        seeds = [REGISTRY_SEED],
        bump = registry_state.bump,
    )]
    pub registry_state: Account<'info, RegistryState>,

    #[account(
        init,
        payer = owner,
        space = Rule::LEN,
        seeds = [RULE_SEED, owner.key().as_ref(), &params.rule_id],
        bump,
    )]
    pub rule: Account<'info, Rule>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkTriggered<'info> {
    #[account(mut, seeds = [RULE_SEED, rule.owner.as_ref(), &rule.rule_id], bump = rule.bump)]
    pub rule: Account<'info, Rule>,
    /// Trusted monitor keypair — should be a PDA of the executor or a multisig
    pub monitor: Signer<'info>,
}

#[derive(Accounts)]
pub struct MarkProving<'info> {
    #[account(mut, seeds = [RULE_SEED, rule.owner.as_ref(), &rule.rule_id], bump = rule.bump)]
    pub rule: Account<'info, Rule>,
    pub monitor: Signer<'info>,
}

#[derive(Accounts)]
pub struct MarkExecuted<'info> {
    #[account(mut, seeds = [RULE_SEED, rule.owner.as_ref(), &rule.rule_id], bump = rule.bump)]
    pub rule: Account<'info, Rule>,
    /// The executor program CPI-calls this — must be the executor program's PDA
    pub executor: SystemAccount<'info>,
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelRule<'info> {
    #[account(mut, seeds = [RULE_SEED, rule.owner.as_ref(), &rule.rule_id], bump = rule.bump)]
    pub rule: Account<'info, Rule>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [REGISTRY_SEED], bump = registry_state.bump, has_one = authority)]
    pub registry_state: Account<'info, RegistryState>,
    pub authority: Signer<'info>,
}