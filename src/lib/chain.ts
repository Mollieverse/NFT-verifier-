export type EvmChain = "ethereum" | "polygon" | "base" | "arbitrum" | "optimism";
export type Chain = "solana" | EvmChain;

const EVM_CHAINS: EvmChain[] = ["ethereum", "polygon", "base", "arbitrum", "optimism"];

export function isEvmChain(c: string): c is EvmChain {
  return (EVM_CHAINS as string[]).includes(c);
}

/**
 * Best-effort chain inference from an address shape.
 * EVM addresses are 0x + 40 hex chars; Solana addresses are base58, 32–44 chars,
 * never start with 0x, and contain no 0/O/I/l.
 */
export function detectChainFromAddress(addr: string): Chain | null {
  const s = addr.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(s)) return "ethereum";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) && !s.startsWith("0x")) return "solana";
  return null;
}

export const EVM_RESERVOIR_HOST: Record<EvmChain, string> = {
  ethereum: "api.reservoir.tools",
  polygon: "api-polygon.reservoir.tools",
  base: "api-base.reservoir.tools",
  arbitrum: "api-arbitrum.reservoir.tools",
  optimism: "api-optimism.reservoir.tools",
};
