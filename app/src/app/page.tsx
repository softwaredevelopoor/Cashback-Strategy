export default function HomePage() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card fade-up">
        <h1 className="font-display text-4xl font-bold leading-tight text-ink">
          $CASHBACK turns patience into protocol-powered cashback.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink/80">
          Cashback Strategy is a memecoin + protocol experiment where your cashback tier increases the longer your
          tokens stay staked in the protocol vault. No short-term churn incentives, only conviction rewards.
        </p>
      </section>
      <section className="card fade-up" style={{ animationDelay: "140ms" }}>
        <h2 className="font-display text-2xl font-semibold">How It Works</h2>
        <ul className="mt-4 space-y-3 text-sm text-ink/80">
          <li>1. Register your holder profile and stake $CASHBACK.</li>
          <li>2. Your tier rises as uninterrupted holding duration grows.</li>
          <li>3. Claims are gated by cooldown and minimum holding threshold.</li>
          <li>4. Unstaking resets accrual, reducing abuse from timing games.</li>
        </ul>
      </section>
    </div>
  );
}
