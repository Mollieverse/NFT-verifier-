import type { Chain } from "./chain";

export interface MarketplaceParse {
  chain: Chain;
  address: string;        // mint address OR symbol slug (see `isSymbol`)
  symbol?: string;        // when known (e.g. Magic Eden Solana URLs)
  isSymbol?: boolean;     // true when `address` is actually a slug, not an on-chain id
  source: "magiceden" | "tensor" | "opensea" | "blur";
}

/**
 * Parse a marketplace URL and extract the contract / collection address + chain.
 * For Solana Magic Eden / Tensor URLs, the path segment is a *symbol slug*
 * (e.g. "mad_lads"), not a mint. We mark that with `isSymbol` so downstream
 * verification can resolve it via the marketplace API instead of treating it
 * as an on-chain mint.
 */
export function parseMarketplaceUrl(input: string): MarketplaceParse | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  // Magic Eden
  if (host.endsWith("magiceden.io") || host.endsWith("magiceden.us")) {
    if (parts[0] === "marketplace" && parts[1]) {
      return { chain: "solana", address: parts[1], symbol: parts[1], isSymbol: true, source: "magiceden" };
    }
    if (parts[0] === "collections" && parts[1] && parts[2]) {
      const chain = parts[1] as Chain;
      if (chain === "solana" || chain === "ethereum" || chain === "polygon" || chain === "base" || chain === "arbitrum" || chain === "optimism") {
        const isSym = chain === "solana"; // Solana collection slugs aren't mints
        return { chain, address: parts[2], symbol: isSym ? parts[2] : undefined, isSymbol: isSym, source: "magiceden" };
      }
    }
  }

  // Tensor (Solana) — slugs only
  if (host.endsWith("tensor.trade")) {
    if (parts[0] === "trade" && parts[1]) {
      return { chain: "solana", address: parts[1], symbol: parts[1], isSymbol: true, source: "tensor" };
    }
  }

  // OpenSea
  if (host.endsWith("opensea.io")) {
    if (parts[0] === "assets" && parts[1] && parts[2]) {
      const chain = parts[1] === "matic" ? "polygon" : (parts[1] as Chain);
      return { chain, address: parts[2], source: "opensea" };
    }
    if (parts[0] === "collection" && parts[1]) {
      return { chain: "ethereum", address: parts[1], isSymbol: true, source: "opensea" };
    }
  }

  // Blur (Ethereum)
  if (host.endsWith("blur.io")) {
    if (parts[0] === "collection" && parts[1]) {
      return { chain: "ethereum", address: parts[1], source: "blur" };
    }
  }

  return null;
}
