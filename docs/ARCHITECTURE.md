# Architecture

## Program: `cashback_strategy`

Anchor program implementing time-based cashback over a staking-vault model.

## Accounts and PDAs

### `Config` PDA
- Seeds: `['config']`
- Stores global parameters:
  - admin
  - mint
  - staking vault address
  - treasury vault address
  - tier durations
  - tier bps rates
  - min hold amount
  - cooldown
  - K-factor cap
  - cashback period scaling

### `Holder` PDA
- Seeds: `['holder', owner_pubkey]`
- Stores holder state:
  - owner
  - staked amount
  - accrual start timestamp
  - last claim timestamp
  - current tier index

### `staking_authority` PDA
- Seeds: `['staking_authority']`
- Program signer for staking vault withdrawals.

### `treasury_authority` PDA
- Seeds: `['treasury_authority']`
- Program signer for treasury payouts.

### Vault Accounts
- **Staking vault ATA**: owned by `staking_authority` PDA
- **Treasury vault ATA**: owned by `treasury_authority` PDA
- Same mint as `$CASHBACK`

## Tier Formula

1. Holding duration:
- `holding_duration = now - accrual_start_ts`

2. Tier selection:
- Highest index where `holding_duration >= tier_durations[index]`

3. Effective amount:
- If `k_factor_cap == 0`: full `staked_amount`
- Else: `min(staked_amount, k_factor_cap)`

4. Reward:
- `base = effective_amount * tier_bps / 10000`
- `reward = base * elapsed_since_last_claim / cashback_period_secs`

## Instruction Set

- `initialize_treasury`
- `register_holder`
- `stake_tokens`
- `unstake_tokens`
- `update_holder_state`
- `claim_cashback`
- `fund_treasury`
- `admin_update_params`

## Event Emissions

- `HolderRegistered`
- `HolderUpdated`
- `TierUpgraded`
- `CashbackClaimed`
- `TreasuryFunded`

## Anti-Abuse Logic

- **Reset-on-change**: stake/unstake resets accrual timestamps and tier.
- **Minimum threshold**: prevents dust farming.
- **Cooldown**: blocks high-frequency claim draining.
- **K-factor cap**: limits whale dominance in payout distribution.

## Why Staking Vault Instead of Token-2022 Transfer Hook

Token-2022 transfer hooks can track transfer behavior more natively but increase integration complexity and token compatibility constraints.

Staking vault model chosen here because:
- deterministic and simple accounting
- easier claim logic correctness
- straightforward to test with Anchor local validator

Potential future migration path:
- add Token-2022 transfer hook support for wallet-native holding-time tracking.
