export default function TreasuryPage() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="card fade-up md:col-span-2">
        <h1 className="font-display text-3xl font-bold">Treasury Pool</h1>
        <p className="mt-2 text-sm text-ink/80">
          Treasury deposits fund cashback payouts. Program-level checks prevent over-claims and preserve pool integrity.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs uppercase tracking-wider text-ink/60">Current Balance</p>
            <p className="mt-1 text-lg font-semibold">1,000,000 CASHBACK</p>
          </div>
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs uppercase tracking-wider text-ink/60">Claim Cooldown</p>
            <p className="mt-1 text-lg font-semibold">24h</p>
          </div>
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs uppercase tracking-wider text-ink/60">K-Factor Cap</p>
            <p className="mt-1 text-lg font-semibold">10,000,000</p>
          </div>
        </div>
      </section>

      <section className="card fade-up" style={{ animationDelay: "120ms" }}>
        <h2 className="font-display text-xl font-semibold">Funding Rules</h2>
        <ul className="mt-4 space-y-3 text-sm text-ink/80">
          <li>Admin or treasury multisig can top up pool via `fund_treasury`.</li>
          <li>Only available treasury balance can be distributed.</li>
          <li>Tiered rewards scale with uninterrupted holding time.</li>
        </ul>
      </section>
    </div>
  );
}
