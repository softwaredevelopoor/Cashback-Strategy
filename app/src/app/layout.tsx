import type { Metadata } from "next";
import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cashback Strategy",
  description: "$CASHBACK rewards long-term token conviction with rising cashback tiers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body">
        <Providers>
          <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-8">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-2xl font-bold tracking-tight">Cashback Strategy</p>
                <p className="text-sm text-ink/75">Hold stronger, earn stronger.</p>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/" className="rounded-xl bg-white/70 px-3 py-2 text-sm font-medium">Home</Link>
                <Link href="/dashboard" className="rounded-xl bg-white/70 px-3 py-2 text-sm font-medium">Dashboard</Link>
                <Link href="/treasury" className="rounded-xl bg-white/70 px-3 py-2 text-sm font-medium">Treasury</Link>
                <WalletMultiButton className="!bg-coral hover:!bg-coral/90" />
              </div>
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
