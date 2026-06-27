import { NextResponse } from "next/server";
import { detectChainFromAddress, isEvmChain, type Chain } from "@/lib/chain";
import {
  getSolanaAsset,
  collectionFromAsset,
  getMagicEdenCollectionBySymbol,
  resolveMagicEdenCollection,
  getMagicEdenStats,
  getMagicEdenActivities,
  getMagicEdenHolderStats,
} from "@/lib/solana";
import { getEvmCollection, getEvmCollectionSales } from "@/lib/evm";
import { buildRisk, solanaSignals, evmSignals } from "@/lib/risk";
import { prisma } from "@/lib/db";

const SOLANA_MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    address?: string;
    chain?: Chain;
    symbol?: string;
    isSymbol?: boolean;
  };
  if (!body.address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const chain = body.chain ?? detectChainFromAddress(body.address);
  if (!chain) return NextResponse.json({ error: "could not detect chain — supply { chain }" }, { status: 400 });

  let result: any = null;
  try {
    if (chain === "solana") {
      // If marked as symbol, OR the input doesn't look like a base58 mint,
      // treat it as a Magic Eden slug and resolve via the marketplace first.
      const treatAsSymbol = body.isSymbol === true || !SOLANA_MINT_RE.test(body.address);
      result = await verifySolana(body.address, body.symbol ?? (treatAsSymbol ? body.address : undefined), treatAsSymbol);
    } else if (isEvmChain(chain)) {
      result = await verifyEvm(chain, body.address);
    }
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

async function verifySolana(address: string, symbolHint?: string, inputIsSymbol = false) {
  // Resolution strategy:
  //   - If input is a symbol slug: hit Magic Eden first, then pull a sample
  //     tokenMint from activities to fetch on-chain creator data.
  //   - If input is a mint: getAsset → if NFT, follow grouping to collection.
  let asset: Awaited<ReturnType<typeof getSolanaAsset>> = null;
  let collectionMint = address;
  let assetName: string | undefined;
  let assetImage: string | undefined;
  let metaplexVerifiedCreator: boolean | undefined; // undefined = unknown, don't penalize
  let hasName = false;

  // Pre-fetch ME if we have a symbol hint, trying common slug variants
  // (mad_lads ↔ madlads, foo-bar ↔ foo_bar, lowercase, etc.).
  let me: Awaited<ReturnType<typeof getMagicEdenCollectionBySymbol>> = null;
  if (symbolHint) {
    me = await resolveMagicEdenCollection(symbolHint).catch(() => null);
  }

  if (!inputIsSymbol) {
    asset = await getSolanaAsset(address).catch(() => null);
    if (asset) {
      const groupedCollection = collectionFromAsset(asset);
      if (groupedCollection && groupedCollection !== address) collectionMint = groupedCollection;
      assetName = asset.content?.metadata?.name;
      assetImage = asset.content?.links?.image ?? asset.content?.files?.[0]?.uri;
      hasName = !!assetName;
      metaplexVerifiedCreator = !!asset.creators?.some((c) => c.verified);
    }
  }

  // If we still don't have an asset but ME resolved, grab a sample tokenMint
  // from activities to get creator info from the chain.
  if (!asset && me?.symbol) {
    const samples = await getMagicEdenActivities(me.symbol, 5).catch(() => []);
    const mint = samples.find((a) => a.tokenMint)?.tokenMint;
    if (mint) {
      asset = await getSolanaAsset(mint).catch(() => null);
      if (asset) {
        const grouped = collectionFromAsset(asset);
        if (grouped) collectionMint = grouped;
        metaplexVerifiedCreator = !!asset.creators?.some((c) => c.verified);
        assetImage = assetImage ?? asset.content?.links?.image ?? asset.content?.files?.[0]?.uri;
      }
    }
  }

  const collectionAsset = collectionMint === address ? asset : await getSolanaAsset(collectionMint).catch(() => null);
  const collectionName = collectionAsset?.content?.metadata?.name;
  const collectionSymbol = symbolHint
    ?? collectionAsset?.content?.metadata?.symbol
    ?? asset?.content?.metadata?.symbol;

  // Fallback ME lookups if we still don't have one
  if (!me && collectionSymbol) {
    me = await resolveMagicEdenCollection(collectionSymbol).catch(() => null);
  }
  if (!me && collectionName) {
    const guess = collectionName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    me = await resolveMagicEdenCollection(guess).catch(() => null);
  }

  const symbol = me?.symbol;
  const [stats, holderStats, activities] = await Promise.all([
    symbol ? getMagicEdenStats(symbol).catch(() => null) : Promise.resolve(null),
    symbol ? getMagicEdenHolderStats(symbol).catch(() => null) : Promise.resolve(null),
    symbol ? getMagicEdenActivities(symbol, 10).catch(() => []) : Promise.resolve([]),
  ]);

  const signals = solanaSignals({
    metaplexVerifiedCreator, // may be undefined → signal skipped
    magicEdenBadged: me?.isBadged,
    magicEdenFlagged: me?.isFlagged,
    uniqueHolders: holderStats?.uniqueHolders,
    totalSupply: holderStats?.totalSupply,
    hasName: hasName || !!collectionName || !!me?.name,
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
