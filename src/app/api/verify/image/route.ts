import { NextResponse } from "next/server";
import { dHash, hamming, similarity } from "@/lib/image-hash";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const MATCH_THRESHOLD = 18; // hamming distance — lower = more similar

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

  const all = await prisma.imageHash.findMany({
    include: { collection: true },
  });

  const ranked = all
    .map((h) => {
      const d = hamming(queryHash, h.phash);
      return {
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
      };
    })
    .sort((a, b) => a.distance - b.distance);

  const matches = ranked.filter((r) => r.distance <= MATCH_THRESHOLD).slice(0, 5);
  const best = matches[0] ?? null;

  await prisma.report.create({
    data: {
      inputType: "image",
      input: queryHash,
      result: JSON.stringify({ queryHash, matches }),
    },
  }).catch(() => null);

  return NextResponse.json({
    queryHash,
    indexSize: all.length,
    bestMatch: best,
    matches,
    note: matches.length === 0
      ? "No match in the indexed collection set. If the collection isn't well-known, we can't ID it from the image alone."
      : best && best.distance <= 6
        ? "Strong match — high confidence this image belongs to the matched collection."
        : "Possible match — image is visually similar but not identical. Could be a copycat.",
  });
}
