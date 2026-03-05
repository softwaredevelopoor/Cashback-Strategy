"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { formatDuration } from "@/lib/cashback";

const TIERS = [
  { name: "Sprout", secs: 2 * 24 * 3600, rate: "1.0%" },
  { name: "Ember", secs: 7 * 24 * 3600, rate: "2.5%" },
  { name: "Forge", secs: 30 * 24 * 3600, rate: "4.0%" },
  { name: "Legend", secs: 90 * 24 * 3600, rate: "6.0%" },
];

export default function DashboardPage() {
  const wallet = useWallet();
  const [holdingSecs] = useState(11 * 24 * 3600 + 3600);

  const tier = useMemo(() => {
    let current = TIERS[0];
    for (const t of TIERS) {
      if (holdingSecs >= t.secs) {
        current = t;
      }
    }
    return current;
  }, [holdingSecs]);

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="card fade-up md:col-span-2">
        <h1 className="font-display text-3xl font-bold">Holder Dashboard</h1>
        <p className="mt-2 text-sm text-ink/80">
          Connect wallet, stake in protocol vault, and track your cashback tier progression.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs uppercase tracking-wider text-ink/60">Connected Wallet</p>
            <p className="mt-1 break-all text-sm font-medium">{wallet.publicKey?.toBase58() ?? "Not connected"}</p>
          </div>
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs uppercase tracking-wider text-ink/60">Holding Duration</p>
            <p className="mt-1 text-sm font-medium">{formatDuration(holdingSecs)}</p>
          </div>
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs uppercase tracking-wider text-ink/60">Current Tier</p>
            <p className="mt-1 text-sm font-medium">{tier.name}</p>
          </div>
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs uppercase tracking-wider text-ink/60">Cashback Rate</p>
            <p className="mt-1 text-sm font-medium">{tier.rate}</p>
          </div>
        </div>
      </div>

      <div className="card fade-up" style={{ animationDelay: "120ms" }}>
        <h2 className="font-display text-xl font-semibold">Claim Cashback</h2>
        <p className="mt-3 text-sm text-ink/80">
          Claims obey cooldown and minimum hold checks. In production, wire this button to the SDK `claimCashback` call.
        </p>
        <button
          className="mt-6 w-full rounded-xl bg-coral px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={!wallet.connected}
        >
          Claim (SDK Hook)
        </button>
      </div>
    </div>
  );
}
