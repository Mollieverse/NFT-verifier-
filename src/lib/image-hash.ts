import sharp from "sharp";

/**
 * dHash (difference hash): resize to 9x8 grayscale, compare each pixel to
 * the next pixel in its row. 64 bits, robust to scale and minor recoloring.
 * Returns 16-char hex string.
 */
export async function dHash(buf: Buffer): Promise<string> {
  const raw = await sharp(buf)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  const bits: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = raw[y * 9 + x];
      const right = raw[y * 9 + x + 1];
      bits.push(left < right ? 1 : 0);
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

export async function dHashFromUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "findr/0.1" },
    });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return await dHash(Buffer.from(ab));
  } catch {
    return null;
  }
}

/** Hamming distance between two 16-char hex hashes (64 bits). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Convert hamming distance to a 0–100 similarity score. */
export function similarity(distance: number): number {
  return Math.round(((64 - distance) / 64) * 100);
}
