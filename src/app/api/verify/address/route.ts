import { NextResponse } from "next/server";
import { detectChainFromAddress, isEvmChain, type Chain } from "@/lib/chain";
import {
  getSolanaAsset,
  collectionFromAsset,
  getMagicEdenCollectionBySymbol,
  getMagicEdenStats,
  getMagicEdenActivities,
  getMagicEdenHolderStats,
} from "@/lib/solana";
import { getEvmCollection, getEvmCollectionSales } from "@/lib/evm";
import { buildRisk, solanaSignals, evmSignals } from "@/lib/risk";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = (await req.json()) as { address?: string; chain?: Chain; symbol?: string };
  if (!body.address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const chain = body.chain ?? detectChainFromAddress(body.address);
  if (!chain) return NextResponse.json({ error: "could not detect chain — supply { chain }" }, { status: 400 });

  let result: any = null;
  try {
    result = chain === "solana"
      ? await verifySolana(body.address, body.symbol)
      : isEvmChain(chain)
        ? await verifyEvm(chain, body.address)
        : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "external lookup failed";
    return NextResponse.json({ error: msg, chain }, { status: 502 });
  }

  if (!result) return NextResponse.json({ error: "unsupported chain" }, { status: 400 });

  await prisma.report.create({
    data: { inputType: "address", input: `${chain}:${body.address}`, result: JSON.stringify(result) },
  }).catch(() => null);

  return NextResponse.json(result);
}

async function verifySolana(address: string, symbolHint?: string) {
  // Two cases: address is a collection mint, OR it's an individual NFT mint.
  // Try DAS getAsset first — if it's an NFT, follow grouping to its collection.
  const asset = await getSolanaAsset(address);
  let collectionMint = address;
  let assetName: string | undefined;
  let assetImage: string | undefined;
  let metaplexVerifiedCreator = false;
  let hasName = false;

  if (asset) {
    const groupedCollection = collectionFromAsset(asset);
    if (groupedCollection && groupedCollection !== address) collectionMint = groupedCollection;
    assetName = asset.content?.metadata?.name;
    assetImage = asset.content?.links?.image ?? asset.content?.files?.[0]?.uri;
    hasName = !!assetName;
    metaplexVerifiedCreator = !!asset.creators?.some((c) => c.verified);
  }

  // If we now have a different collection mint, fetch it too.
  const collectionAsset = collectionMint === address ? asset : await getSolanaAsset(collectionMint);
  const collectionName = collectionAsset?.content?.metadata?.name;
  const collectionSymbol = symbolHint
    ?? collectionAsset?.content?.metadata?.symbol
    ?? asset?.content?.metadata?.symbol;

  // Magic Eden lookup is symbol-based, so try to resolve.
  let me = collectionSymbol ? await getMagicEdenCollectionBySymbol(collectionSymbol) : null;
  // Common heuristic: try kebab-cased name
  if (!me && collectionName) {
    const guess = collectionName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    me = await getMagicEdenCollectionBySymbol(guess);
  }

  const symbol = me?.symbol;
  const [stats, holderStats, activities] = await Promise.all([
    symbol ? getMagicEdenStats(symbol) : Promise.resolve(null),
    symbol ? getMagicEdenHolderStats(symbol) : Promise.resolve(null),
    symbol ? getMagicEdenActivities(symbol, 10) : Promise.resolve([]),
  ]);

  const signals = solanaSignals({
    metaplexVerifiedCreator,
    magicEdenBadged: me?.isBadged,
    magicEdenFlagged: me?.isFlagged,
    uniqueHolders: holderStats?.uniqueHolders,
    totalSupply: holderStats?.totalSupply,
    hasName: hasName || !!collectionName,
  });

  return {
    chain: "solana" as const,
    address,
    collectionMint,
    name: me?.name ?? collectionName ?? assetName ?? "Unknown",
    symbol: me?.symbol ?? collectionSymbol,
    image: me?.image ?? collectionAsset?.content?.links?.image ?? assetImage,
    asset: asset ? {
      name: assetName,
      image: assetImage,
      owner: asset.ownership?.owner,
    } : null,
    stats: {
      floorPriceSol: stats?.floorPrice ? stats.floorPrice / 1e9 : me?.floorPrice ? me.floorPrice / 1e9 : undefined,
      listedCount: stats?.listedCount ?? me?.listedCount,
      volumeAllSol: stats?.volumeAll ? stats.volumeAll / 1e9 : me?.volumeAll ? me.volumeAll / 1e9 : undefined,
      avgPrice24hrSol: stats?.avgPrice24hr ? stats.avgPrice24hr / 1e9 : undefined,
      totalSupply: holderStats?.totalSupply,
      uniqueHolders: holderStats?.uniqueHolders,
    },
    sales: activities.filter((a) => a.type === "buyNow" || a.type === "bid").map((a) => ({
      type: a.type,
      priceSol: a.price,
      buyer: a.buyer,
      seller: a.seller,
      blockTime: a.blockTime,
      tokenMint: a.tokenMint,
    })),
    risk: buildRisk(signals),
  };
}

async function verifyEvm(chain: "ethereum" | "polygon" | "base" | "arbitrum" | "optimism", address: string) {
  const [coll, sales] = await Promise.all([
    getEvmCollection(chain, address),
    getEvmCollectionSales(chain, address, 10),
  ]);

  const signals = evmSignals({
    openseaVerificationStatus: coll?.openseaVerificationStatus,
    isSpam: coll?.isSpam,
    isNsfw: coll?.isNsfw,
    ownerCount: coll?.ownerCount,
    tokenCount: coll?.tokenCount ? Number(coll.tokenCount) : undefined,
    contractDeployedAt: coll?.contractDeployedAt,
  });

  return {
    chain,
    address,
    name: coll?.name ?? "Unknown",
    symbol: coll?.symbol,
    image: coll?.image,
    stats: {
      floorPriceEth: coll?.floorAsk?.price?.amount?.native,
      floorPriceUsd: coll?.floorAsk?.price?.amount?.usd,
      tokenCount: coll?.tokenCount ? Number(coll.tokenCount) : undefined,
      ownerCount: coll?.ownerCount,
      onSaleCount: coll?.onSaleCount ? Number(coll.onSaleCount) : undefined,
      volumeAllEth: coll?.volume?.allTime,
      volume1dEth: coll?.volume?.["1day"],
      volume7dEth: coll?.volume?.["7day"],
    },
    sales: sales.map((s) => ({
      tokenId: s.token?.tokenId,
      tokenName: s.token?.name,
      tokenImage: s.token?.image,
      priceNative: s.price?.amount?.native,
      priceUsd: s.price?.amount?.usd,
      currency: s.price?.currency?.symbol,
      from: s.from,
      to: s.to,
      timestamp: s.timestamp,
      txHash: s.txHash,
    })),
    risk: buildRisk(signals),
  };
}
