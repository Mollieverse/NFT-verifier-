import { Verifier } from "@/components/verifier";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-8 pt-20 pb-24">
      <div className="mb-16">
        <div className="label mb-6">NFT verifier · v0.1</div>
        <h1 className="display text-[64px] sm:text-[88px]">
          Real or fake.
        </h1>
        <p className="text-base text-[var(--color-muted)] mt-6 max-w-md leading-relaxed">
          Paste a contract, drop an image, pass in a marketplace link or wallet.
          One verdict, the signals behind it, and the numbers.
        </p>
      </div>

      <Verifier />
    </div>
  );
}
