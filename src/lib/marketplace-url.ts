import type { Chain } from "./chain";

export interface MarketplaceParse {
  chain: Chain;
  address: string;
  source: "magiceden" | "tensor" | "opensea" | "blur";
}

/**
 * Parse a marketplace URL and extract the contract / collection address + chain.
 * Best-effort: each marketplace has multiple URL shapes; we cover the common ones.
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

  // Magic Eden:
  //   https://magiceden.io/marketplace/<symbol>       (Solana)
  //   https://magiceden.io/collections/<chain>/<address>  (EVM)
  if (host.endsWith("magiceden.io") || host.endsWith("magiceden.us")) {
    if (parts[0] === "marketplace" && parts[1]) return { chain: "solana", address: parts[1], source: "magiceden" };
    if (parts[0] === "collections" && parts[1] && parts[2]) {
      const chain = parts[1] as Chain;
      if (chain === "solana" || chain === "ethereum" || chain === "polygon" || chain === "base" || chain === "arbitrum" || chain === "optimism") {
        return { chain, address: parts[2], source: "magiceden" };
      }
    }
  }

  // Tensor (Solana):
  //   https://www.tensor.trade/trade/<symbol-or-slug>
  if (host.endsWith("tensor.trade")) {
    if (parts[0] === "trade" && parts[1]) return { chain: "solana", address: parts[1], source: "tensor" };
  }

  // OpenSea:
  //   https://opensea.io/assets/<chain>/<address>/<tokenId>
  //   https://opensea.io/collection/<slug>
  if (host.endsWith("opensea.io")) {
    if (parts[0] === "assets" && parts[1] && parts[2]) {
      const chain = parts[1] === "matic" ? "polygon" : (parts[1] as Chain);
      return { chain, address: parts[2], source: "opensea" };
    }
    // Slug-only — we can't resolve to an address without an API call; let the caller decide.
    if (parts[0] === "collection" && parts[1]) return { chain: "ethereum", address: parts[1], source: "opensea" };
  }

  // Blur (Ethereum):
  //   https://blur.io/collection/<slug-or-address>
  if (host.endsWith("blur.io")) {
    if (parts[0] === "collection" && parts[1]) return { chain: "ethereum", address: parts[1], source: "blur" };
  }

  return null;
}
