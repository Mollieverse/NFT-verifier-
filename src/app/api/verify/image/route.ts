import { NextResponse } from "next/server";
import { dHash, hamming, similarity } from "@/lib/image-hash";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

// Two-tier thresholds (64-bit hash):
//   ≤ 8  → strong match (effectively the same image)
//   ≤ 14 → possible candidate (likely copycat / re-encoded)
//   > 14 → no meaningful match
const STRONG_THRESHOLD = 8;
const CANDIDATE_THRESHOLD = 14;
const BATCH_SIZE = 5_000;

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  let buf: Buffer | null = null;

  if (ct.startsWith("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "image file required" }, { status: 400 });
    }
    buf = Buffer.from(await file.arrayBuffer());
  } else if (ct.startsWith("application/json")) {
    const body = (await req.json()) as { url?: string };
    if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
    const r = await fetch(body.url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return NextResponse.json({ error: `fetch failed: ${r.status}` }, { status: 400 });
    buf = Buffer.from(await r.arrayBuffer());
  } else {
    return NextResponse.json({ error: "send multipart/form-data with `image`, or JSON { url }" }, { status: 400 });
  }

  const queryHash = await dHash(buf);

  // Stream the index in batches so we never load the whole table into memory.
  // Keep only the top-N candidates seen so far.
  const indexSize = await prisma.imageHash.count();
  type Ranked = {
    distance: number;
    similarity: number;
    collection: {
      chain: string;
      address: string;
      name: string;
      symbol: string | null;
      image: string | null;
      verified: boolean;
    };
  };
  const top: Ranked[] = [];
  const seenCollection = new Set<string>();

  for (let skip = 0; skip < indexSize; skip += BATCH_SIZE) {
    const batch = await prisma.imageHash.findMany({
      skip,
      take: BATCH_SIZE,
      select: {
        phash: true,
        collection: {
          select: {
            chain: true,
            address: true,
            name: true,
            symbol: true,
            imageUrl: true,
            verified: true,
          },
        },
      },
    });

    for (const h of batch) {
      const d = hamming(queryHash, h.phash);
      if (d > CANDIDATE_THRESHOLD) continue;
      const key = `${h.collection.chain}:${h.collection.address}`;
      if (seenCollection.has(key)) continue;
      seenCollection.add(key);
      top.push({
        distance: d,
        similarity: similarity(d),
        collection: {
          chain: h.collection.chain,
          address: h.collection.address,
          name: h.collection.name,
          symbol: h.collection.symbol,
          image: h.collection.imageUrl,
          verified: h.collection.verified,
        },
      });
    }
  }

  top.sort((a, b) => a.distance - b.distance);
  const matches = top.slice(0, 5);
  const best = matches[0] ?? null;

  // Distinct chains hit — proves the search ran cross-chain.
  const chainsSearched = await prisma.indexedCollection.findMany({
    select: { chain: true },
    distinct: ["chain"],
  });

  let note: string;
  if (!best) {
    note = `No match found. We searched ${indexSize.toLocaleString()} indexed images across ${chainsSearched.length} chain(s) and nothing came close. Either this NFT isn't from an indexed collection, or the image was modified beyond recognition.`;
  } else if (best.distance <= STRONG_THRESHOLD) {
    note = "Strong match — high confidence this image belongs to the matched collection.";
  } else {
    note = "Possible match — image is visually similar but not identical. Could be a copycat or a different edition.";
  }

  await prisma.report.create({
    data: {
      inputType: "image",
      input: queryHash,
      result: JSON.stringify({ queryHash, matches }),
    },
  }).catch(() => null);

  return NextResponse.json({
    queryHash,
    indexSize,
    chainsSearched: chainsSearched.map((c) => c.chain),
    bestMatch: best,
    matches,
    note,
  });
}
