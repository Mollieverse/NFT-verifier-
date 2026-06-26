function heliusUrl(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error("HELIUS_API_KEY not set");
  return `https://mainnet.helius-rpc.com/?api-key=${key}`;
}

interface DasAsset {
  id: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    files?: Array<{ uri?: string }>;
    links?: { image?: string };
    json_uri?: string;
  };
  grouping?: Array<{ group_key: string; group_value: string }>;
  ownership?: { owner?: string };
  creators?: Array<{ address: string; verified: boolean; share: number }>;
  royalty?: { percent?: number };
  burnt?: boolean;
  mint_extensions?: unknown;
  supply?: { print_max_supply?: number; print_current_supply?: number };
}

export async function getSolanaAsset(mint: string): Promise<DasAsset | null> {
  const res = await fetch(heliusUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "findr",
      method: "getAsset",
      params: { id: mint },
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { result?: DasAsset; error?: { message: string } };
  return j.result ?? null;
}

export interface MagicEdenCollection {
  symbol: string;
  name: string;
  description?: string;
  image?: string;
  floorPrice?: number;     // lamports
  listedCount?: number;
  volumeAll?: number;      // lamports
  hasCNFTs?: boolean;
  isFlagged?: boolean;
  isBadged?: boolean;      // verified
}

export async function getMagicEdenCollectionBySymbol(symbol: string): Promise<MagicEdenCollection | null> {
  const r = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}`);
  if (!r.ok) return null;
  return (await r.json()) as MagicEdenCollection;
}

export async function getMagicEdenStats(symbol: string): Promise<{ floorPrice?: number; listedCount?: number; volumeAll?: number; avgPrice24hr?: number } | null> {
  const r = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}/stats`);
  if (!r.ok) return null;
  return await r.json();
}

export async function getMagicEdenActivities(symbol: string, limit = 10): Promise<Array<{
  signature: string;
  type: string;
  source?: string;
  buyer?: string;
  seller?: string;
  price?: number;
  blockTime?: number;
  tokenMint?: string;
}>> {
  const r = await fetch(
    `https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}/activities?offset=0&limit=${limit}`
  );
  if (!r.ok) return [];
  return await r.json();
}

export async function getMagicEdenHolderStats(symbol: string): Promise<{ totalSupply?: number; uniqueHolders?: number } | null> {
  const r = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}/holder_stats`);
  if (!r.ok) return null;
  return await r.json();
}

/** Walk a wallet's assets, optionally filtered to a specific collection. */
export async function getAssetsByOwner(wallet: string, limit = 100): Promise<DasAsset[]> {
  const r = await fetch(heliusUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "findr",
      method: "getAssetsByOwner",
      params: { ownerAddress: wallet, page: 1, limit, displayOptions: { showCollectionMetadata: true } },
    }),
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { result?: { items?: DasAsset[] } };
  return j.result?.items ?? [];
}

export function collectionFromAsset(asset: DasAsset): string | null {
  return asset.grouping?.find((g) => g.group_key === "collection")?.group_value ?? null;
}
