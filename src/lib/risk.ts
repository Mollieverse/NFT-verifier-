export type Verdict = "verified" | "caution" | "fake" | "unknown";

export interface RiskSignal {
  key: string;
  label: string;
  weight: number;          // 0..1 — relative contribution
  pass: boolean;           // false = risk
  detail?: string;
}

export interface RiskReport {
  verdict: Verdict;
  score: number;           // 0–100, higher = safer
  signals: RiskSignal[];
}

export function buildRisk(signals: RiskSignal[]): RiskReport {
  const totalWeight = signals.reduce((a, s) => a + s.weight, 0) || 1;
  const passWeight = signals.filter((s) => s.pass).reduce((a, s) => a + s.weight, 0);
  const score = Math.round((passWeight / totalWeight) * 100);

  // A "critical fail" only counts when we have meaningful coverage (≥2 signals
  // or total weight ≥ 0.6). Otherwise a single failing high-weight signal
  // could flip an unverifiable collection to "fake" — which is dishonest.
  const hasCoverage = signals.length >= 2 || totalWeight >= 0.6;
  const criticalFail = hasCoverage && signals.some((s) => !s.pass && s.weight >= 0.4);

  let verdict: Verdict;
  if (signals.length === 0 || !hasCoverage) verdict = "unknown";
  else if (criticalFail) verdict = "fake";
  else if (score >= 80) verdict = "verified";
  else if (score >= 55) verdict = "caution";
  else verdict = "fake";

  return { verdict, score, signals };
}

/** Solana risk: combines Metaplex verified creators, Magic Eden badging, holder breadth. */
export function solanaSignals(input: {
  metaplexVerifiedCreator?: boolean; // undefined = unknown (skip, do not penalize)
  magicEdenBadged?: boolean;
  magicEdenFlagged?: boolean;
  uniqueHolders?: number;
  totalSupply?: number;
  hasName: boolean;
}): RiskSignal[] {
  const out: RiskSignal[] = [];

  if (input.metaplexVerifiedCreator !== undefined) {
    out.push({
      key: "metaplex-creator",
      label: "Metaplex verified creator",
      weight: 0.5,
      pass: input.metaplexVerifiedCreator,
      detail: input.metaplexVerifiedCreator
        ? "On-chain creator signature present"
        : "No verified on-chain creator — common in scam mints",
    });
  }

  if (input.magicEdenBadged !== undefined) {
    out.push({
      key: "marketplace-verified",
      label: "Magic Eden verified",
      weight: 0.4,
      pass: input.magicEdenBadged,
      detail: input.magicEdenBadged ? "Badged collection on Magic Eden" : "Not badged on Magic Eden",
    });
  }

  if (input.magicEdenFlagged) {
    out.push({
      key: "marketplace-flagged",
      label: "Marketplace flag",
      weight: 0.6,
      pass: false,
      detail: "Flagged by Magic Eden",
    });
  }

  if (input.uniqueHolders !== undefined && input.totalSupply) {
    const ratio = input.uniqueHolders / input.totalSupply;
    out.push({
      key: "holder-distribution",
      label: "Holder distribution",
      weight: 0.2,
      pass: ratio > 0.15,
      detail: `${input.uniqueHolders} holders / ${input.totalSupply} supply (${(ratio * 100).toFixed(1)}%)`,
    });
  }

  if (input.hasName) {
    out.push({
      key: "metadata",
      label: "On-chain metadata",
      weight: 0.1,
      pass: true,
      detail: "Name present",
    });
  }

  return out;
}

/** EVM risk: based on Reservoir/OpenSea signals. */
export function evmSignals(input: {
  openseaVerificationStatus?: string;
  isSpam?: boolean;
  isNsfw?: boolean;
  ownerCount?: number;
  tokenCount?: number;
  contractDeployedAt?: string;
}): RiskSignal[] {
  const out: RiskSignal[] = [];

  const verified =
    input.openseaVerificationStatus === "verified" ||
    input.openseaVerificationStatus === "approved";
  out.push({
    key: "opensea-verified",
    label: "OpenSea verification",
    weight: 0.5,
    pass: verified,
    detail: input.openseaVerificationStatus
      ? `Status: ${input.openseaVerificationStatus}`
      : "Unknown status",
  });

  if (input.isSpam) {
    out.push({
      key: "spam-flag",
      label: "Spam flag",
      weight: 0.6,
      pass: false,
      detail: "Marked as spam by Reservoir",
    });
  }

  if (input.ownerCount && input.tokenCount) {
    const ratio = input.ownerCount / input.tokenCount;
    out.push({
      key: "holder-distribution",
      label: "Holder distribution",
      weight: 0.2,
      pass: ratio > 0.1,
      detail: `${input.ownerCount} holders / ${input.tokenCount} supply (${(ratio * 100).toFixed(1)}%)`,
    });
  }

  if (input.contractDeployedAt) {
    const ageDays = (Date.now() - new Date(input.contractDeployedAt).getTime()) / 86_400_000;
    out.push({
      key: "contract-age",
      label: "Contract age",
      weight: 0.2,
      pass: ageDays > 30,
      detail: `${Math.floor(ageDays)} days old`,
    });
  }

  return out;
}
