import { EVM_RESERVOIR_HOST, type EvmChain } from "./chain";

function hdrs(): HeadersInit {
  const h: Record<string, string> = { accept: "application/json" };
  if (process.env.RESERVOIR_API_KEY) h["x-api-key"] = process.env.RESERVOIR_API_KEY;
  return h;
}

export interface ReservoirCollection {
  id: string;
  name: string;
  slug?: string;
  symbol?: string;
  image?: string;
  description?: string;
  tokenCount?: string;
  onSaleCount?: string;
  ownerCount?: number;
  createdAt?: string;
  floorAsk?: { price?: { amount?: { native?: number; usd?: number } } };
  volume?: { allTime?: number; "1day"?: number; "7day"?: number; "30day"?: number };
  openseaVerificationStatus?: string;
  isSpam?: boolean;
  isNsfw?: boolean;
  contractDeployedAt?: string;
}

export async function getEvmCollection(chain: EvmChain, address: string): Promise<ReservoirCollection | null> {
  const host = EVM_RESERVOIR_HOST[chain];
  const url = `https://${host}/collections/v7?id=${address.toLowerCase()}&includeTopBid=false`;
  const r = await fetch(url, { headers: hdrs() });
  if (!r.ok) return null;
  const j = (await r.json()) as { collections?: ReservoirCollection[] };
  return j.collections?.[0] ?? null;
}

export interface ReservoirSale {
  saleId: string;
  txHash?: string;
  timestamp?: number;
  from?: string;
  to?: string;
  price?: { amount?: { native?: number; usd?: number }; currency?: { symbol?: string } };
  token?: { tokenId?: string; name?: string; image?: string };
}

export async function getEvmCollectionSales(chain: EvmChain, address: string, limit = 10): Promise<ReservoirSale[]> {
  const host = EVM_RESERVOIR_HOST[chain];
  const url = `https://${host}/sales/v6?collection=${address.toLowerCase()}&limit=${limit}&sortBy=time`;
  const r = await fetch(url, { headers: hdrs() });
  if (!r.ok) return [];
  const j = (await r.json()) as { sales?: ReservoirSale[] };
  return j.sales ?? [];
}

export interface ReservoirOwnedToken {
  token?: { contract?: string; tokenId?: string; name?: string; image?: string; collection?: { id?: string; name?: string; image?: string; openseaVerificationStatus?: string; isSpam?: boolean } };
  ownership?: { tokenCount?: string };
}

export async function getEvmUserTokens(chain: EvmChain, wallet: string, limit = 50): Promise<ReservoirOwnedToken[]> {
  const host = EVM_RESERVOIR_HOST[chain];
  const url = `https://${host}/users/${wallet}/tokens/v10?limit=${limit}&includeTopBid=false`;
  const r = await fetch(url, { headers: hdrs() });
  if (!r.ok) return [];
  const j = (await r.json()) as { tokens?: ReservoirOwnedToken[] };
  return j.tokens ?? [];
}
