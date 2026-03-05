# Cashback Strategy — $CASHBACK

> **Hold stronger. Earn stronger.**

Cashback Strategy is a Solana memecoin + on-chain cashback protocol that rewards long-term holders with rising cashback tiers. The longer you keep your $CASHBACK tokens staked in the protocol vault — without withdrawing — the higher your cashback rate becomes.

This is designed as a more advanced holder-rewards system than simple pump-and-reflect mechanics: every security parameter (cooldown, minimum threshold, whale cap) is configurable on-chain, and the entire reward pipeline is transparent and auditable.

> ⚠️ **Disclaimer:** This project is experimental software built for research and educational purposes. Nothing in this repository constitutes financial advice. Use at your own risk. Always conduct an independent security audit before deploying to mainnet.

---

## Table of Contents

1. [Concept](#concept)
2. [How Cashback Works](#how-cashback-works)
3. [Why Holding Longer Increases Your Cashback](#why-holding-longer-increases-your-cashback)
4. [Tier Table (Example)](#tier-table-example)
5. [Anti-Abuse Mechanisms](#anti-abuse-mechanisms)
6. [Architecture at a Glance](#architecture-at-a-glance)
7. [Repository Structure](#repository-structure)
8. [Getting Started](#getting-started)
9. [Running Tests](#running-tests)
10. [Optional Frontend](#optional-frontend)
11. [Documentation](#documentation)
12. [Roadmap](#roadmap)

---

## Concept

Most memecoins with "holder rewards" simply redistribute a percentage of transaction volume to all token holders passively. This creates a perverse incentive: large wallets can accumulate, collect rewards, and dump.

**Cashback Strategy flips the dynamic:**

- Rewards are earned **per unit of uninterrupted holding time**, not per trade volume.
- Any withdrawal from the vault **resets your accrual clock** to zero — exactly like selling.
- This design rewards **conviction**, not velocity.

---

## How Cashback Works

Cashback Strategy uses a **staking-vault model** (as opposed to Token-2022 transfer hooks — see [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the tradeoff analysis):

1. **Register** — Create your holder profile on-chain (`register_holder`).
2. **Stake** — Deposit $CASHBACK into the protocol vault (`stake_tokens`). Your accrual clock starts.
3. **Accrue** — Time passes. Your holding duration increases. Tiers upgrade automatically.
4. **Update** — Call `update_holder_state` to sync your tier (or it is synced automatically at claim time).
5. **Claim** — Call `claim_cashback` to receive cashback tokens from the treasury pool, subject to:
   - minimum holding threshold
   - claim cooldown (e.g. 24 h between claims)
   - available treasury balance
6. **Withdraw (optional)** — Call `unstake_tokens` to retrieve your tokens. **This resets all accrual.**

---

## Why Holding Longer Increases Your Cashback

The reward formula is:

```
reward = (effective_amount × tier_rate / 10000) × (elapsed_since_last_claim / cashback_period)
```

Where `tier_rate` (in basis points) increases with holding duration:

- Longer uninterrupted stake → higher `tier_rate`
- Higher `tier_rate` → larger `reward` per claim period
- Withdrawing and re-staking **resets** `accrual_start_ts`, forcing you back to Tier 0

This structure ensures that time-in-vault — not amount deposited — is the primary value driver.

---

## Tier Table (Example)

| Tier | Name    | Minimum Duration | Cashback Rate |
|------|---------|------------------|---------------|
| 0    | Sprout  | 7 days           | 0.50%         |
| 1    | Ember   | 30 days          | 1.00%         |
| 2    | Forge   | 90 days          | 2.00%         |
| 3    | Legend  | 180 days         | 3.00%         |

> Tier parameters are fully configurable by the admin via `admin_update_params`.  
> Rates are expressed in basis points (`tier_bps`). 100 bps = 1%.

---

## Anti-Abuse Mechanisms

| Mechanism               | Description                                                                 |
|-------------------------|-----------------------------------------------------------------------------|
| **Accrual reset**       | Staking more or withdrawing any amount resets the holding clock to `now`.   |
| **Minimum threshold**   | Wallet must hold at least `min_hold_amount` to be eligible to claim.        |
| **Claim cooldown**      | A configurable delay (e.g. 24 h) enforced between consecutive claims.       |
| **K-factor cap**        | Optional: caps the effective stake amount used in reward math, limiting whale extraction. Set to `0` to disable. |
| **Treasury liquidity**  | Claims can never exceed available treasury balance — no deficit spending.   |

---

## Architecture at a Glance

```
Config PDA  [seeds: "config"]
  └── stores all global params + vault addresses

Holder PDA  [seeds: "holder", owner_pubkey]
  └── stores per-user state: staked_amount, accrual_start_ts, tier_index, last_claim_ts

staking_authority PDA  [seeds: "staking_authority"]
  └── signer for staking vault ATA (holds deposited $CASHBACK)

treasury_authority PDA  [seeds: "treasury_authority"]
  └── signer for treasury vault ATA (from which cashback is paid out)
```

Full account layout, PDA derivations, and event schema are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Repository Structure

```
Cashback-Strategy/
├── Anchor.toml                        # Anchor workspace config
├── Cargo.toml                         # Rust workspace
├── package.json                       # Root JS/TS tooling
├── tsconfig.json                      # Root TypeScript config
│
├── programs/
│   └── cashback_strategy/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs                 # Full Anchor program (all instructions, accounts, events, errors)
│
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts                   # TypeScript SDK (CashbackStrategyClient)
│
├── tests/
│   └── cashback_strategy.ts           # Anchor integration tests
│
├── scripts/
│   ├── localnet.sh                    # Build + test shortcut
│   └── initialize-example.ts          # Example initialization script
│
├── migrations/
│   └── deploy.ts                      # Anchor migration hook
│
├── app/                               # Next.js + Tailwind frontend (optional)
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/
│       │   ├── layout.tsx             # Root layout with wallet provider
│       │   ├── page.tsx               # Home page
│       │   ├── dashboard/page.tsx     # Holder dashboard (tier, duration, claim)
│       │   └── treasury/page.tsx      # Treasury pool stats
│       └── lib/
│           └── cashback.ts            # PDA helpers + utilities
│
└── docs/
    ├── ARCHITECTURE.md                # PDAs, tier formula, anti-abuse, design tradeoffs
    └── TOKENOMICS.md                  # Supply, fee allocation, claiming rules
```

---

## Getting Started

### Prerequisites

| Tool        | Version        |
|-------------|----------------|
| Rust        | stable (latest)|
| Solana CLI  | ≥ 1.18         |
| Anchor CLI  | 0.30.1         |
| Node.js     | ≥ 20           |
| Yarn / npm  | any            |

### Install JS dependencies

```bash
npm install
```

### Build the Anchor program

```bash
anchor build
```

This compiles the Rust program and generates the IDL at `target/idl/cashback_strategy.json`.

### Deploy to localnet

```bash
anchor localnet
# in a separate terminal:
CASHBACK_MINT=<your_mint_pubkey> npx ts-node scripts/initialize-example.ts
```

---

## Running Tests

```bash
anchor test
```

The test suite (`tests/cashback_strategy.ts`) covers:

- ✅ Treasury initialization
- ✅ Holder registration
- ✅ Token staking
- ✅ Time-based tier progression (real time via `sleep`)
- ✅ Treasury funding
- ✅ Cashback claiming (balance delta assertion)
- ✅ Unstake resets accrual clock and tier index
- ✅ Treasury balance preserved after cashback payout

---

## Optional Frontend

A minimal Next.js 15 + Tailwind CSS app is included in `app/`.

Features:
- Phantom / Solflare wallet connect via `@solana/wallet-adapter-react`
- **Home** — project narrative and how-it-works
- **Dashboard** — connected wallet, holding duration, current tier, cashback rate, claim button
- **Treasury** — pool balance, cooldown, K-factor stats

```bash
cd app
npm install
npm run dev
# open http://localhost:3000
```

Set `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_PROGRAM_ID` in `app/.env.local` for your target cluster.

---

## Documentation

| File | Contents |
|------|----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Account/PDA layout, tier formula, anti-abuse logic, Token-2022 vs staking-vault tradeoffs |
| [docs/TOKENOMICS.md](docs/TOKENOMICS.md) | Supply model, cashback pool allocation, claiming rules, sustainability notes |

---

## Roadmap

- [ ] Mainnet deployment + verified IDL
- [ ] Token-2022 transfer hook integration for wallet-native holding-time tracking
- [ ] Governance module for on-chain parameter voting
- [ ] Treasury auto-replenishment via protocol fee router
- [ ] Dashboard v2: historical claim chart, leaderboard

---

*Cashback Strategy — not financial advice. Audit before deploying.*
