use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkY6W2BeZ7FEfcYkgMQ2N2P");

const TIER_COUNT: usize = 4;

#[program]
pub mod cashback_strategy {
    use super::*;

    pub fn initialize_treasury(ctx: Context<InitializeTreasury>, params: InitializeParams) -> Result<()> {
        validate_tier_inputs(params.tier_durations, params.tier_bps)?;
        require!(params.cashback_period_secs > 0, CashbackError::InvalidConfig);

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.mint = ctx.accounts.mint.key();
        config.staking_vault = ctx.accounts.staking_vault.key();
        config.treasury_vault = ctx.accounts.treasury_vault.key();
        config.min_hold_amount = params.min_hold_amount;
        config.claim_cooldown_secs = params.claim_cooldown_secs;
        config.k_factor_cap = params.k_factor_cap;
        config.cashback_period_secs = params.cashback_period_secs;
        config.tier_durations = params.tier_durations;
        config.tier_bps = params.tier_bps;
        config.bump = ctx.bumps.config;
        config.staking_authority_bump = ctx.bumps.staking_authority;
        config.treasury_authority_bump = ctx.bumps.treasury_authority;

        Ok(())
    }

    pub fn register_holder(ctx: Context<RegisterHolder>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        let holder = &mut ctx.accounts.holder;
        holder.owner = ctx.accounts.owner.key();
        holder.staked_amount = 0;
        holder.accrual_start_ts = now;
        holder.last_claim_ts = now;
        holder.tier_index = 0;
        holder.bump = ctx.bumps.holder;

        emit!(HolderRegistered {
            owner: holder.owner,
            timestamp: now,
        });

        Ok(())
    }

    pub fn stake_tokens(ctx: Context<StakeTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, CashbackError::InvalidAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    to: ctx.accounts.staking_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        let holder = &mut ctx.accounts.holder;
        holder.staked_amount = holder
            .staked_amount
            .checked_add(amount)
            .ok_or(CashbackError::MathOverflow)?;

        // Reset accrual whenever stake amount changes to avoid timing abuse.
        let now = Clock::get()?.unix_timestamp;
        holder.accrual_start_ts = now;
        holder.last_claim_ts = now;
        holder.tier_index = 0;

        emit!(HolderUpdated {
            owner: holder.owner,
            staked_amount: holder.staked_amount,
            tier_index: holder.tier_index,
            accrual_start_ts: holder.accrual_start_ts,
            timestamp: now,
        });

        Ok(())
    }

    pub fn unstake_tokens(ctx: Context<UnstakeTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, CashbackError::InvalidAmount);

        let holder = &mut ctx.accounts.holder;
        require!(holder.staked_amount >= amount, CashbackError::InsufficientStake);

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"staking_authority",
            &[ctx.accounts.config.staking_authority_bump],
        ]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.staking_authority.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        holder.staked_amount = holder
            .staked_amount
            .checked_sub(amount)
            .ok_or(CashbackError::MathOverflow)?;

        // Withdrawal is treated as a reset event in the vault model.
        let now = Clock::get()?.unix_timestamp;
        holder.accrual_start_ts = now;
        holder.last_claim_ts = now;
        holder.tier_index = 0;

        emit!(HolderUpdated {
            owner: holder.owner,
            staked_amount: holder.staked_amount,
            tier_index: holder.tier_index,
            accrual_start_ts: holder.accrual_start_ts,
            timestamp: now,
        });

        Ok(())
    }

    pub fn update_holder_state(ctx: Context<UpdateHolderState>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let config = &ctx.accounts.config;
        let holder = &mut ctx.accounts.holder;

        let holding_duration = now.saturating_sub(holder.accrual_start_ts) as u64;
        let new_tier = tier_for_duration(config.tier_durations, holding_duration);
        if new_tier > holder.tier_index {
            emit!(TierUpgraded {
                owner: holder.owner,
                old_tier: holder.tier_index,
                new_tier,
                timestamp: now,
            });
        }

        holder.tier_index = new_tier;

        emit!(HolderUpdated {
            owner: holder.owner,
            staked_amount: holder.staked_amount,
            tier_index: holder.tier_index,
            accrual_start_ts: holder.accrual_start_ts,
            timestamp: now,
        });

        Ok(())
    }

    pub fn claim_cashback(ctx: Context<ClaimCashback>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let config = &ctx.accounts.config;
        let holder = &mut ctx.accounts.holder;

        require!(
            holder.staked_amount >= config.min_hold_amount,
            CashbackError::BelowMinimumHolding
        );

        let since_last_claim = now.saturating_sub(holder.last_claim_ts) as u64;
        require!(
            since_last_claim >= config.claim_cooldown_secs,
            CashbackError::ClaimCooldownActive
        );

        let holding_duration = now.saturating_sub(holder.accrual_start_ts) as u64;
        let tier = tier_for_duration(config.tier_durations, holding_duration);
        if tier > holder.tier_index {
            emit!(TierUpgraded {
                owner: holder.owner,
                old_tier: holder.tier_index,
                new_tier: tier,
                timestamp: now,
            });
        }

        let capped_amount = if config.k_factor_cap == 0 {
            holder.staked_amount
        } else {
            holder.staked_amount.min(config.k_factor_cap)
        };

        let tier_bps = config.tier_bps[tier as usize] as u128;
        let reward = calculate_reward(
            capped_amount as u128,
            tier_bps,
            since_last_claim as u128,
            config.cashback_period_secs as u128,
        )?;

        let reward_u64 = u64::try_from(reward).map_err(|_| CashbackError::MathOverflow)?;
        require!(reward_u64 > 0, CashbackError::ZeroReward);
        require!(
            ctx.accounts.treasury_vault.amount >= reward_u64,
            CashbackError::TreasuryInsufficient
        );

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"treasury_authority",
            &[ctx.accounts.config.treasury_authority_bump],
        ]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury_vault.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.treasury_authority.to_account_info(),
                },
                signer_seeds,
            ),
            reward_u64,
        )?;

        holder.last_claim_ts = now;
        holder.tier_index = tier;

        emit!(CashbackClaimed {
            owner: holder.owner,
            reward_amount: reward_u64,
            tier_index: tier,
            timestamp: now,
        });

        emit!(HolderUpdated {
            owner: holder.owner,
            staked_amount: holder.staked_amount,
            tier_index: holder.tier_index,
            accrual_start_ts: holder.accrual_start_ts,
            timestamp: now,
        });

        Ok(())
    }

    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        require!(amount > 0, CashbackError::InvalidAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.admin_token_account.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(TreasuryFunded {
            funder: ctx.accounts.admin.key(),
            amount,
            new_balance: ctx.accounts.treasury_vault.amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn admin_update_params(ctx: Context<AdminUpdateParamsContext>, params: AdminUpdateParams) -> Result<()> {
        let config = &mut ctx.accounts.config;

        if let Some(min_hold_amount) = params.min_hold_amount {
            config.min_hold_amount = min_hold_amount;
        }
        if let Some(claim_cooldown_secs) = params.claim_cooldown_secs {
            config.claim_cooldown_secs = claim_cooldown_secs;
        }
        if let Some(k_factor_cap) = params.k_factor_cap {
            config.k_factor_cap = k_factor_cap;
        }
        if let Some(cashback_period_secs) = params.cashback_period_secs {
            require!(cashback_period_secs > 0, CashbackError::InvalidConfig);
            config.cashback_period_secs = cashback_period_secs;
        }
        if let Some(tier_durations) = params.tier_durations {
            validate_tier_inputs(tier_durations, config.tier_bps)?;
            config.tier_durations = tier_durations;
        }
        if let Some(tier_bps) = params.tier_bps {
            validate_tier_inputs(config.tier_durations, tier_bps)?;
            config.tier_bps = tier_bps;
        }

        Ok(())
    }
}

fn validate_tier_inputs(tier_durations: [u64; TIER_COUNT], tier_bps: [u16; TIER_COUNT]) -> Result<()> {
    for i in 0..TIER_COUNT {
        require!(tier_durations[i] > 0, CashbackError::InvalidConfig);
        require!(tier_bps[i] <= 10_000, CashbackError::InvalidConfig);
        if i > 0 {
            require!(tier_durations[i] > tier_durations[i - 1], CashbackError::InvalidConfig);
            require!(tier_bps[i] >= tier_bps[i - 1], CashbackError::InvalidConfig);
        }
    }
    Ok(())
}

fn tier_for_duration(tier_durations: [u64; TIER_COUNT], holding_duration: u64) -> u8 {
    let mut tier: u8 = 0;
    for (idx, threshold) in tier_durations.iter().enumerate() {
        if holding_duration >= *threshold {
            tier = idx as u8;
        }
    }
    tier
}

fn calculate_reward(
    amount: u128,
    tier_bps: u128,
    elapsed_secs: u128,
    cashback_period_secs: u128,
) -> Result<u128> {
    let base = amount
        .checked_mul(tier_bps)
        .ok_or(CashbackError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(CashbackError::MathOverflow)?;

    base.checked_mul(elapsed_secs)
        .ok_or(CashbackError::MathOverflow)?
        .checked_div(cashback_period_secs)
        .ok_or(CashbackError::MathOverflow)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub min_hold_amount: u64,
    pub claim_cooldown_secs: u64,
    pub k_factor_cap: u64,
    pub cashback_period_secs: u64,
    pub tier_durations: [u64; TIER_COUNT],
    pub tier_bps: [u16; TIER_COUNT],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct AdminUpdateParams {
    pub min_hold_amount: Option<u64>,
    pub claim_cooldown_secs: Option<u64>,
    pub k_factor_cap: Option<u64>,
    pub cashback_period_secs: Option<u64>,
    pub tier_durations: Option<[u64; TIER_COUNT]>,
    pub tier_bps: Option<[u16; TIER_COUNT]>,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = Config::SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    /// CHECK: PDA used only as token vault authority.
    #[account(seeds = [b"staking_authority"], bump)]
    pub staking_authority: UncheckedAccount<'info>,
    /// CHECK: PDA used only as token vault authority.
    #[account(seeds = [b"treasury_authority"], bump)]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = staking_authority
    )]
    pub staking_vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = treasury_authority
    )]
    pub treasury_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHolder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = owner,
        space = Holder::SPACE,
        seeds = [b"holder", owner.key().as_ref()],
        bump
    )]
    pub holder: Account<'info, Holder>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeTokens<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"holder", owner.key().as_ref()],
        bump = holder.bump,
        constraint = holder.owner == owner.key() @ CashbackError::Unauthorized
    )]
    pub holder: Account<'info, Holder>,
    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key() @ CashbackError::Unauthorized,
        constraint = owner_token_account.mint == config.mint @ CashbackError::InvalidMint
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = staking_vault.key() == config.staking_vault @ CashbackError::InvalidVault
    )]
    pub staking_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnstakeTokens<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"holder", owner.key().as_ref()],
        bump = holder.bump,
        constraint = holder.owner == owner.key() @ CashbackError::Unauthorized
    )]
    pub holder: Account<'info, Holder>,
    /// CHECK: PDA signer for staking vault transfers.
    #[account(
        seeds = [b"staking_authority"],
        bump = config.staking_authority_bump
    )]
    pub staking_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = staking_vault.key() == config.staking_vault @ CashbackError::InvalidVault
    )]
    pub staking_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key() @ CashbackError::Unauthorized,
        constraint = owner_token_account.mint == config.mint @ CashbackError::InvalidMint
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateHolderState<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"holder", owner.key().as_ref()],
        bump = holder.bump,
        constraint = holder.owner == owner.key() @ CashbackError::Unauthorized
    )]
    pub holder: Account<'info, Holder>,
}

#[derive(Accounts)]
pub struct ClaimCashback<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"holder", owner.key().as_ref()],
        bump = holder.bump,
        constraint = holder.owner == owner.key() @ CashbackError::Unauthorized
    )]
    pub holder: Account<'info, Holder>,
    /// CHECK: PDA signer for treasury vault transfers.
    #[account(
        seeds = [b"treasury_authority"],
        bump = config.treasury_authority_bump
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = treasury_vault.key() == config.treasury_vault @ CashbackError::InvalidVault
    )]
    pub treasury_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key() @ CashbackError::Unauthorized,
        constraint = owner_token_account.mint == config.mint @ CashbackError::InvalidMint
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ CashbackError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        constraint = admin_token_account.owner == admin.key() @ CashbackError::Unauthorized,
        constraint = admin_token_account.mint == config.mint @ CashbackError::InvalidMint
    )]
    pub admin_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = treasury_vault.key() == config.treasury_vault @ CashbackError::InvalidVault
    )]
    pub treasury_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminUpdateParamsContext<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ CashbackError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub staking_vault: Pubkey,
    pub treasury_vault: Pubkey,
    pub min_hold_amount: u64,
    pub claim_cooldown_secs: u64,
    pub k_factor_cap: u64,
    pub cashback_period_secs: u64,
    pub tier_durations: [u64; TIER_COUNT],
    pub tier_bps: [u16; TIER_COUNT],
    pub bump: u8,
    pub staking_authority_bump: u8,
    pub treasury_authority_bump: u8,
}

impl Config {
    pub const SPACE: usize = 8 + 256;
}

#[account]
pub struct Holder {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub accrual_start_ts: i64,
    pub last_claim_ts: i64,
    pub tier_index: u8,
    pub bump: u8,
}

impl Holder {
    pub const SPACE: usize = 8 + 96;
}

#[event]
pub struct HolderRegistered {
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct HolderUpdated {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub tier_index: u8,
    pub accrual_start_ts: i64,
    pub timestamp: i64,
}

#[event]
pub struct TierUpgraded {
    pub owner: Pubkey,
    pub old_tier: u8,
    pub new_tier: u8,
    pub timestamp: i64,
}

#[event]
pub struct CashbackClaimed {
    pub owner: Pubkey,
    pub reward_amount: u64,
    pub tier_index: u8,
    pub timestamp: i64,
}

#[event]
pub struct TreasuryFunded {
    pub funder: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum CashbackError {
    #[msg("Unauthorized account")]
    Unauthorized,
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Invalid vault account")]
    InvalidVault,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Holding amount below minimum threshold")]
    BelowMinimumHolding,
    #[msg("Claim cooldown is still active")]
    ClaimCooldownActive,
    #[msg("Treasury vault has insufficient balance")]
    TreasuryInsufficient,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("No reward is available yet")]
    ZeroReward,
    #[msg("Invalid configuration values")]
    InvalidConfig,
    #[msg("Insufficient staked balance")]
    InsufficientStake,
}
