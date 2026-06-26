/**
 * Index every NFT collection we can reach via public marketplace APIs.
 *
 *   - Solana:  Magic Eden popular-collections feed, paginated to exhaustion.
 *   - EVM:     Reservoir /collections/v7, paginated by continuation token for
 *              ethereum, polygon, base, arbitrum, optimism.
 *
 * Verified AND unverified collections are both indexed; the `verified` column
 * captures marketplace status so the runtime can flag copycats.
 *
 * Usage:
 *   npx tsx scripts/seed-collections.mts                 # full sweep
 *   npx tsx scripts/seed-collections.mts --limit 1000    # cap per source
 *   npx tsx scripts/seed-collections.mts --chains solana,ethereum
 *   npx tsx scripts/seed-collections.mts --skip-images   # metadata only
 *
 * Honest scope: "every collection in the world" doesn't exist as a queryable
 * set. We index what marketplaces have catalogued — typically tens of thousands
 * of EVM collections + thousands of Solana collections. Rare/private mints
 * outside marketplace indices won't be here.
 */
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import "dotenv/config";

const prisma = new PrismaClient();

const args = parseArgs(process.argv.slice(2));
const PER_SOURCE_LIMIT = args.limit ?? Infinity;
const SELECTED_CHAINS = args.chains ?? ["solana", "ethereum", "polygon", "base", "arbitrum", "optimism"];
const SKIP_IMAGES = !!args.skipImages;
const IMG_CONCURRENCY = 8;
const PAGE_SLEEP_MS = 250;

const EVM_RESERVOIR_HOST: Record<string, string> = {
  ethereum: "api.reservoir.tools",
  polygon:  "api-polygon.reservoir.tools",
  base:     "api-base.reservoir.tools",
  arbitrum: "api-arbitrum.reservoir.tools",
  optimism: "api-optimism.reservoir.tools",
};

const stats = { fetched: 0, indexed: 0, imgFail: 0, skipped: 0 };

// ─── dHash ────────────────────────────────────────────────────────────────────
async function dHash(buf: Buffer): Promise<string> {
  const raw = await sharp(buf).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  const bits: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(raw[y * 9 + x] < raw[y * 9 + x + 1] ? 1 : 0);
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += (((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3])).toString(16);
  }
  return hex;
}

async function fetchBuf(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "findr-seed/0.1" } });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

// ─── DB writer with bounded concurrency ──────────────────────────────────────
type Pending = { chain: string; address: string; name: string; symbol: string | null; imageUrl: string | null; verified: boolean };
const queue: Pending[] = [];
let inflight = 0;

async function drain() {
  while (queue.length || inflight) {
    while (queue.length && inflight < IMG_CONCURRENCY) {
      const item = queue.shift()!;
      inflight += 1;
      processOne(item).finally(() => { inflight -= 1; });
    }
    await sleep(50);
  }
}

async function processOne(it: Pending) {
  try {
    let phash: string | null = null;
    if (!SKIP_IMAGES && it.imageUrl) {
      const buf = await fetchBuf(it.imageUrl);
      if (buf) phash = await dHash(buf).catch(() => null);
      else stats.imgFail += 1;
    }

    const existing = await prisma.indexedCollection.findUnique({
      where: { chain_address: { chain: it.chain, address: it.address } },
      include: { hashes: true },
    });

    if (existing && existing.hashes.some((h) => h.phash === phash)) {
      stats.skipped += 1;
      return;
    }

    const coll = await prisma.indexedCollection.upsert({
      where: { chain_address: { chain: it.chain, address: it.address } },
      create: { chain: it.chain, address: it.address, name: it.name, symbol: it.symbol ?? undefined, imageUrl: it.imageUrl ?? undefined, verified: it.verified },
      update: { name: it.name, symbol: it.symbol ?? undefined, imageUrl: it.imageUrl ?? undefined, verified: it.verified },
    });

    if (phash) {
      await prisma.imageHash.deleteMany({ where: { collectionId: coll.id } });
      await prisma.imageHash.create({ data: { collectionId: coll.id, phash, sampleUrl: it.imageUrl ?? undefined } });
    }
    stats.indexed += 1;
  } catch (e) {
    console.warn(`  ✗ ${it.chain}/${it.address}: ${e instanceof Error ? e.message : "err"}`);
  }
}

// ─── Solana via Magic Eden ───────────────────────────────────────────────────
async function seedSolana() {
  console.log("\n[solana] sweeping Magic Eden…");
  const PAGE = 500;
  let offset = 0;
  let pageNum = 0;
  while (offset < PER_SOURCE_LIMIT) {
    const url = `https://api-mainnet.magiceden.dev/v2/collections?limit=${PAGE}&offset=${offset}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) {
      console.warn(`  page ${pageNum} status ${r.status}, stopping`);
      break;
    }
    const list = (await r.json()) as Array<{
      symbol: string; name: string; image?: string; isBadged?: boolean; isFlagged?: boolean;
      categories?: string[]; description?: string;
    }>;
    if (!list.length) break;

    for (const c of list) {
      if (stats.fetched >= PER_SOURCE_LIMIT) break;
      // Magic Eden Solana collections are keyed by symbol; we use symbol as the
      // primary identifier here because the on-chain collection mint isn't always
      // exposed on this endpoint. Detail-lookup happens at verify-time.
      queue.push({
        chain: "solana",
        address: c.symbol,
        name: c.name ?? c.symbol,
        symbol: c.symbol,
        imageUrl: c.image ?? null,
        verified: !!c.isBadged,
      });
      stats.fetched += 1;
    }

    pageNum += 1;
    offset += list.length;
    console.log(`  page ${pageNum}: +${list.length}, total fetched ${stats.fetched}, indexed ${stats.indexed}`);
    if (list.length < PAGE) break;
    await sleep(PAGE_SLEEP_MS);
  }
}

// ─── EVM via Reservoir ───────────────────────────────────────────────────────
async function seedEvm(chain: string) {
  console.log(`\n[${chain}] sweeping Reservoir…`);
  const host = EVM_RESERVOIR_HOST[chain];
  let continuation: string | null = null;
  let pageNum = 0;
  const hdr: HeadersInit = { accept: "application/json" };
  if (process.env.RESERVOIR_API_KEY) (hdr as any)["x-api-key"] = process.env.RESERVOIR_API_KEY;

  while (true) {
    if (stats.fetched >= PER_SOURCE_LIMIT) break;
    const url = `https://${host}/collections/v7?limit=20&sortBy=allTimeVolume${continuation ? `&continuation=${continuation}` : ""}`;
    const r = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) {
      console.warn(`  ${chain} page ${pageNum} status ${r.status}, stopping`);
      break;
    }
    const j = (await r.json()) as {
      collections?: Array<{
        id: string; name: string; symbol?: string; image?: string;
        openseaVerificationStatus?: string; isSpam?: boolean;
      }>;
      continuation?: string;
    };
    const list = j.collections ?? [];
    if (!list.length) break;

    for (const c of list) {
      if (stats.fetched >= PER_SOURCE_LIMIT) break;
      const verified =
        c.openseaVerificationStatus === "verified" ||
        c.openseaVerificationStatus === "approved";
      queue.push({
        chain,
        address: c.id.toLowerCase(),
        name: c.name ?? c.id,
        symbol: c.symbol ?? null,
        imageUrl: c.image ?? null,
        verified,
      });
      stats.fetched += 1;
    }

    pageNum += 1;
    if (pageNum % 10 === 0) {
      console.log(`  ${chain} page ${pageNum}: total fetched ${stats.fetched}, indexed ${stats.indexed}`);
    }
    if (!j.continuation) break;
    continuation = j.continuation;
    await sleep(PAGE_SLEEP_MS);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`chains: ${SELECTED_CHAINS.join(", ")}`);
  console.log(`per-source limit: ${PER_SOURCE_LIMIT === Infinity ? "unlimited" : PER_SOURCE_LIMIT}`);
  console.log(`images: ${SKIP_IMAGES ? "skipped" : "fetched + dHashed"}`);

  // Run pagination + image-fetch concurrently; allSettled so one bad chain
  // doesn't kill the others.
  const work: Array<{ chain: string; p: Promise<void> }> = [];
  for (const chain of SELECTED_CHAINS) {
    if (chain === "solana") work.push({ chain, p: seedSolana() });
    else if (EVM_RESERVOIR_HOST[chain]) work.push({ chain, p: seedEvm(chain) });
  }
  const settled = await Promise.allSettled(work.map((w) => w.p));
  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
      console.warn(`[${work[i].chain}] failed: ${reason}`);
    }
  });
  await drain();

  const totalColls = await prisma.indexedCollection.count();
  const totalHashes = await prisma.imageHash.count();
  console.log("\n──────────────────────────────────────────");
  console.log(`Fetched:        ${stats.fetched}`);
  console.log(`Indexed (new):  ${stats.indexed}`);
  console.log(`Skipped (dup):  ${stats.skipped}`);
  console.log(`Image fails:    ${stats.imgFail}`);
  console.log(`Total in DB:    ${totalColls} collections, ${totalHashes} hashes`);
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise((res) => setTimeout(res, ms)); }

function parseArgs(argv: string[]) {
  const out: { limit?: number; chains?: string[]; skipImages?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--chains") out.chains = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--skip-images") out.skipImages = true;
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
