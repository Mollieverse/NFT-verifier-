import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FINDR — NFT verifier",
  description: "Paste a contract, drop an image, prove what's real.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-[var(--color-line)]">
            <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
              <Link href="/" className="mono text-xs tracking-[0.3em]">
                FINDR
              </Link>
              <nav className="mono text-[10px] tracking-[0.25em] uppercase text-[var(--color-muted)] flex gap-8">
                <Link href="/" className="hover:text-[var(--color-fg)]">Verify</Link>
                <Link href="/history" className="hover:text-[var(--color-fg)]">History</Link>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--color-line)] mt-24">
            <div className="max-w-5xl mx-auto px-8 h-14 flex items-center justify-between mono text-[10px] tracking-[0.25em] uppercase text-[var(--color-muted)]">
              <span>v0.1</span>
              <span>Solana · EVM</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
