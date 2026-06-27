import { NextResponse } from "next/server";
import { dHash, hamming, similarity } from "@/lib/image-hash";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const STRONG_THRESHOLD = 8;
const CANDIDATE_THRESHOLD = 14;
const BATCH_SIZE = 2_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const SOFT_TIME_BUDGET_MS = 50_000;

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    // Last-resort guard so we never return an empty body / 500 with no JSON.
    const msg = e instanceof Error ? e.message : "unexpected server error";
    console.error("[verify/image] uncaught", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(req: Request) {
  const started = Date.now();
  const ct = req.headers.get("content-type") ?? "";
  let buf: Buffer | null = null;

  if (ct.startsWith("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "image file required" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: `image too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 10MB)` }, { status: 400 });
    }
    buf = Buffer.from(await file.arrayBuffer());
  } else if (ct.startsWith("application/json")) {
    const body = (await req.json()) as { url?: string };
    if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
    try {
      const r = await fetch(body.url, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return NextResponse.json({ error: `fetch failed: ${r.status}` }, { status: 400 });
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      return NextResponse.json({ error: `could not fetch image url: ${e instanceof Error ? e.message : "network error"}` }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "send multipart/form-data with `image`, or JSON { url }" }, { status: 400 });
  }

  let queryHash: string;
  try {
    queryHash = await dHash(buf);
  } catch (e) {
    return NextResponse.json(
      { error: `could not decode image (unsupported format?): ${e instanceof Error ? e.message : "decode error"}` },
      { status: 400 },
    );
  }

  // Stream index in batches; keep top distinct collections by distance.
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
  let scanned = 0;
  let timedOut = false;

  let skip = 0;
  while (true) {
    if (Date.now() - started > SOFT_TIME_BUDGET_MS) { timedOut = true; break; }
    let batch: Array<{
      phash: string;
      collection: { chain: string; address: string; name: string; symbol: string | null; imageUrl: string | null; verified: boolean };
    }> = [];
    try {
      batch = await prisma.imageHash.findMany({
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
    } catch (e) {
      console.error("[verify/image] db batch failed", e);
      break; // return whatever we have
    }
    if (batch.length === 0) break;
    scanned += batch.length;

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
    skip += BATCH_SIZE;
  }

  top.sort((a, b) => a.distance - b.distance);
  const matches = top.slice(0, 5);
  const best = matches[0] ?? null;

  let chainsSearched: string[] = [];
  try {
    const rows = await prisma.indexedCollection.findMany({ select: { chain: true }, distinct: ["chain"] });
    chainsSearched = rows.map((r) => r.chain);
  } catch { /* non-fatal */ }

  let note: string;
  if (!best) {
    const chainsTxt = chainsSearched.length ? ` across ${chainsSearched.length} chain(s): ${chainsSearched.join(", ")}` : "";
    note = timedOut
      ? `No match found in the first ${scanned.toLocaleString()} images${chainsTxt}. Index search timed out before completing — try again or the image isn't in our indexed collections.`
      : `No NFT collection found. Searched ${scanned.toLocaleString()} indexed images${chainsTxt}. The image isn't from an indexed collection, or it was modified beyond perceptual recognition.`;
  } else if (best.distance <= STRONG_THRESHOLD) {
    note = `Strong match (${best.similarity}% similar on ${best.collection.chain}) — high confidence this image belongs to "${best.collection.name}".`;
  } else {
    note = `Possible match — visually similar but not identical. Could be a copycat, an alternate edition, or compression artifacts.`;
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
    indexSize: scanned,
    chainsSearched,
    bestMatch: best,
    matches,
    timedOut,
    note,
  });
}
