import { NextResponse } from "next/server";
import { detectChainFromAddress, isEvmChain, type Chain } from "@/lib/chain";
import { getAssetsByOwner, collectionFromAsset } from "@/lib/solana";
import { getEvmUserTokens } from "@/lib/evm";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = (await req.json()) as { address?: string; chain?: Chain };
  if (!body.address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const chain = body.chain ?? detectChainFromAddress(body.address);
  if (!chain) return NextResponse.json({ error: "could not detect chain" }, { status: 400 });

  let result: any = null;
  try {
    result = chain === "solana"
      ? await solanaWallet(body.address)
      : isEvmChain(chain)
        ? await evmWallet(chain, body.address)
        : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "external lookup failed";
    return NextResponse.json({ error: msg, chain }, { status: 502 });
  }

  if (!result) return NextResponse.json({ error: "unsupported chain" }, { status: 400 });

  await prisma.report.create({
    data: { inputType: "wallet", input: `${chain}:${body.address}`, result: JSON.stringify(result) },
  }).catch(() => null);

  return NextResponse.json(result);
}

async function solanaWallet(wallet: string) {
  const assets = await getAssetsByOwner(wallet, 100);
  const byCollection = new Map<string, { count: number; sample: { name?: string; image?: string } }>();
  let unGrouped = 0;

  for (const a of assets) {
    const coll = collectionFromAsset(a);
    if (!coll) { unGrouped += 1; continue; }
    const cur = byCollection.get(coll);
    if (cur) cur.count += 1;
    else byCollection.set(coll, {
      count: 1,
      sample: {
        name: a.content?.metadata?.name,
        image: a.content?.links?.image ?? a.content?.files?.[0]?.uri,
      },
    });
  }

  const collections = Array.from(byCollection.entries()).map(([address, { count, sample }]) => ({
    address,
    count,
    sample,
    // Heuristic risk flag: tiny collections often indicate scam airdrops
    suspicious: count === 1 && !sample.name,
  }));

  return {
    chain: "solana" as const,
    wallet,
    totalAssets: assets.length,
    unGrouped,
    collections: collections.sort((a, b) => b.count - a.count),
  };
}

async function evmWallet(chain: "ethereum" | "polygon" | "base" | "arbitrum" | "optimism", wallet: string) {
  const tokens = await getEvmUserTokens(chain, wallet, 100);
  const byCollection = new Map<string, { count: number; name?: string; image?: string; verified: boolean; spam: boolean }>();
  let unGrouped = 0;

  for (const t of tokens) {
    const coll = t.token?.collection;
    if (!coll?.id) { unGrouped += 1; continue; }
    const cur = byCollection.get(coll.id);
    if (cur) cur.count += 1;
    else byCollection.set(coll.id, {
      count: 1,
      name: coll.name,
      image: coll.image,
      verified: coll.openseaVerificationStatus === "verified" || coll.openseaVerificationStatus === "approved",
      spam: !!coll.isSpam,
    });
  }

  const collections = Array.from(byCollection.entries()).map(([address, m]) => ({
    address,
    count: m.count,
    sample: { name: m.name, image: m.image },
    verified: m.verified,
    suspicious: m.spam,
  }));

  return {
    chain,
    wallet,
    totalAssets: tokens.length,
    unGrouped,
    collections: collections.sort((a, b) => b.count - a.count),
  };
}
