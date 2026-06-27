import { Verifier } from "@/components/verifier";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-10 sm:pt-20 pb-16 sm:pb-24">
      <div className="mb-10 sm:mb-16">
        <div className="label mb-4 sm:mb-6">NFT verifier · v0.1</div>
        <h1 className="display text-[44px] sm:text-[88px]">
          Real or fake.
        </h1>
        <p className="text-sm sm:text-base text-[var(--color-muted)] mt-4 sm:mt-6 max-w-md leading-relaxed">
          Paste a contract, drop an image, pass in a marketplace link or wallet.
          One verdict, the signals behind it, and the numbers.
        </p>
      </div>

      <Verifier />
    </div>
  );
}
