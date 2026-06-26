import { NextResponse } from "next/server";
import { parseMarketplaceUrl } from "@/lib/marketplace-url";

export async function POST(req: Request) {
  const body = (await req.json()) as { url?: string };
  if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const parsed = parseMarketplaceUrl(body.url);
  if (!parsed) {
    return NextResponse.json(
      { error: "unrecognized marketplace URL — supported: magiceden.io, tensor.trade, opensea.io, blur.io" },
      { status: 400 }
    );
  }

  return NextResponse.json(parsed);
}
