# Tokenomics: Cashback Strategy ($CASHBACK)

## Supply Model (Example)

- Total supply: `1,000,000,000 $CASHBACK`
- Circulating at launch: project-defined
- Decimal precision: 6 (configurable at mint creation)

## Cashback Pool Allocation

Suggested allocation framework:
- 50% ecosystem + liquidity
- 20% community/airdrops
- 15% treasury reserves
- 10% cashback reward emissions
- 5% ops/security/audit budget

Protocol-level cashback pool is funded through:
- treasury deposits (`fund_treasury`)
- optional fee routing from ecosystem products

## Claiming Rules

- user must be registered holder
- user must stake into protocol vault
- staked amount must be >= `min_hold_amount`
- cooldown must pass between claims
- treasury must have sufficient balance

## Cashback Tiers (Example)

- Tier 0: 2 days -> 1.00%
- Tier 1: 7 days -> 2.00%
- Tier 2: 30 days -> 4.00%
- Tier 3: 90 days -> 6.00%

All rates are represented in basis points (`tier_bps`) and are applied over `cashback_period_secs`.

## Fairness and Sustainability

- K-factor cap prevents oversized wallets from dominating payout extraction.
- Cooldown and minimum threshold reduce spam and micro-claim abuse.
- Treasury-funded model ensures explicit payout budget visibility.

## Risk Notes

- Reward schedules must be calibrated against treasury runway.
- Governance should gate parameter updates to trusted admin/multisig.
- Production launch should include external audit and monitoring.
