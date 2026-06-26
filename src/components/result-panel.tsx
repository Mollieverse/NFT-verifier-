"use client";
import { CopyValue } from "./copy-block";

type Kind = "address" | "image" | "url" | "wallet";

export function ResultPanel({ result }: { result: { kind: Kind; data: any } }) {
  const { kind, data } = result;
  if (kind === "image") return <ImageResult data={data} />;
  if (kind === "wallet") return <WalletResult data={data} />;
  return <AddressResult data={data} />;
}

function VerdictBar({ verdict, score }: { verdict: string; score: number }) {
  const map: Record<string, { text: string; color: string }> = {
    verified: { text: "VERIFIED", color: "var(--color-ok)" },
    caution:  { text: "CAUTION",  color: "var(--color-warn)" },
    fake:     { text: "LIKELY FAKE", color: "var(--color-bad)" },
    unknown:  { text: "UNKNOWN", color: "var(--color-muted)" },
  };
  const m = map[verdict] ?? map.unknown;
  return (
    <div className="border border-[var(--color-line-strong)] mt-12">
      <div className="flex items-stretch">
        <div className="flex-1 p-8 border-r border-[var(--color-line-strong)]">
          <div className="label mb-3">Verdict</div>
          <div className="display text-5xl" style={{ color: m.color }}>{m.text}</div>
        </div>
        <div className="w-48 p-8 flex flex-col items-end justify-center">
          <div className="label mb-2">Score</div>
          <div className="display text-5xl tabular-nums">{score}<span className="text-2xl text-[var(--color-muted)]">/100</span></div>
        </div>
      </div>
    </div>
  );
}

function AddressResult({ data }: { data: any }) {
  return (
    <div>
      <VerdictBar verdict={data.risk?.verdict ?? "unknown"} score={data.risk?.score ?? 0} />

      <Section label="Collection">
        <div className="flex items-start gap-6">
          {data.image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={data.image} alt="" className="w-24 h-24 object-cover border border-[var(--color-line)]" />
          )}
          <div className="flex-1 min-w-0">
            <div className="display text-3xl mb-1">{data.name}</div>
            <div className="mono text-[11px] tracking-wider uppercase text-[var(--color-muted)]">
              {data.chain}{data.symbol ? ` · ${data.symbol}` : ""}
            </div>
          </div>
        </div>
      </Section>

      <Section label="Signals">
        <ul className="divide-y divide-[var(--color-line)]">
          {(data.risk?.signals ?? []).map((s: any) => (
            <li key={s.key} className="py-3 flex items-start gap-4">
              <span
                className="mono text-[10px] tracking-widest uppercase w-16 shrink-0 pt-0.5"
                style={{ color: s.pass ? "var(--color-ok)" : "var(--color-bad)" }}
              >
                {s.pass ? "pass" : "fail"}
              </span>
              <div className="flex-1">
                <div className="text-sm">{s.label}</div>
                {s.detail && <div className="text-xs text-[var(--color-muted)] mt-0.5">{s.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Stats">
        <StatsGrid stats={data.stats ?? {}} chain={data.chain} />
      </Section>

      {(data.sales?.length ?? 0) > 0 && (
        <Section label="Recent activity">
          <ul className="divide-y divide-[var(--color-line)]">
            {data.sales.slice(0, 10).map((s: any, i: number) => (
              <li key={i} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mono text-xs truncate">
                    {s.tokenName ?? s.tokenMint?.slice(0, 12) ?? s.tokenId ?? "—"}
                  </div>
                  <div className="mono text-[10px] tracking-wider uppercase text-[var(--color-muted)] mt-0.5">
                    {s.type ?? "sale"}{s.timestamp ? ` · ${new Date((s.timestamp ?? 0) * 1000).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="mono text-sm tabular-nums shrink-0">
                  {s.priceSol != null ? `${s.priceSol.toFixed(2)} SOL` : null}
                  {s.priceNative != null ? `${s.priceNative.toFixed(3)} ${s.currency ?? "ETH"}` : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section label="Reference">
        <CopyValue label="ADDRESS" value={data.address} />
        {data.collectionMint && data.collectionMint !== data.address && (
          <CopyValue label="COLLECTION" value={data.collectionMint} />
        )}
      </Section>
    </div>
  );
}

function StatsGrid({ stats, chain }: { stats: any; chain: string }) {
  const items: { k: string; v: string | undefined }[] = [];
  const fmt = (n?: number, d = 2) => (n == null ? undefined : n.toLocaleString(undefined, { maximumFractionDigits: d }));
  if (chain === "solana") {
    items.push({ k: "Floor", v: stats.floorPriceSol != null ? `${fmt(stats.floorPriceSol, 3)} SOL` : undefined });
    items.push({ k: "Listed", v: fmt(stats.listedCount, 0) });
    items.push({ k: "Volume", v: stats.volumeAllSol != null ? `${fmt(stats.volumeAllSol, 0)} SOL` : undefined });
    items.push({ k: "Holders", v: fmt(stats.uniqueHolders, 0) });
    items.push({ k: "Supply", v: fmt(stats.totalSupply, 0) });
    items.push({ k: "24h avg", v: stats.avgPrice24hrSol != null ? `${fmt(stats.avgPrice24hrSol, 3)} SOL` : undefined });
  } else {
    items.push({ k: "Floor", v: stats.floorPriceEth != null ? `${fmt(stats.floorPriceEth, 3)} ETH` : undefined });
    items.push({ k: "Floor USD", v: stats.floorPriceUsd != null ? `$${fmt(stats.floorPriceUsd, 0)}` : undefined });
    items.push({ k: "Holders", v: fmt(stats.ownerCount, 0) });
    items.push({ k: "Supply", v: fmt(stats.tokenCount, 0) });
    items.push({ k: "Vol 1d", v: stats.volume1dEth != null ? `${fmt(stats.volume1dEth, 1)} ETH` : undefined });
    items.push({ k: "Vol all", v: stats.volumeAllEth != null ? `${fmt(stats.volumeAllEth, 0)} ETH` : undefined });
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[var(--color-line)] border border-[var(--color-line)]">
      {items.map((it) => (
        <div key={it.k} className="bg-[var(--color-bg)] p-5">
          <div className="label mb-2">{it.k}</div>
          <div className="mono text-lg tabular-nums">{it.v ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

function ImageResult({ data }: { data: any }) {
  const best = data.bestMatch;
  return (
    <div className="mt-12">
      <div className="border border-[var(--color-line-strong)] p-8">
        <div className="label mb-3">Match result</div>
        {best ? (
          <div className="flex items-start gap-6">
            {best.collection.image && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={best.collection.image} alt="" className="w-24 h-24 object-cover border border-[var(--color-line)]" />
            )}
            <div className="flex-1">
              <div className="display text-3xl mb-1">{best.collection.name}</div>
              <div className="mono text-[11px] tracking-wider uppercase text-[var(--color-muted)] mb-4">
                {best.collection.chain} · {best.similarity}% similar
              </div>
              <CopyValue label="ADDRESS" value={best.collection.address} />
            </div>
          </div>
        ) : (
          <div className="display text-3xl text-[var(--color-muted)]">No match in our index.</div>
        )}
        <p className="text-sm text-[var(--color-muted)] mt-6 leading-relaxed">{data.note}</p>
        <div className="mono text-[10px] tracking-widest uppercase text-[var(--color-muted)] mt-4">
          query hash · {data.queryHash} · index size · {data.indexSize}
        </div>
      </div>

      {data.matches.length > 1 && (
        <Section label="Other candidates">
          <ul className="divide-y divide-[var(--color-line)]">
            {data.matches.slice(1).map((m: any, i: number) => (
              <li key={i} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {m.collection.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.collection.image} alt="" className="w-10 h-10 object-cover border border-[var(--color-line)]" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm truncate">{m.collection.name}</div>
                    <div className="mono text-[10px] tracking-wider uppercase text-[var(--color-muted)]">{m.collection.chain}</div>
                  </div>
                </div>
                <div className="mono text-sm tabular-nums text-[var(--color-muted)]">{m.similarity}%</div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function WalletResult({ data }: { data: any }) {
  const flagged = data.collections.filter((c: any) => c.suspicious);
  return (
    <div className="mt-12">
      <div className="border border-[var(--color-line-strong)] p-8">
        <div className="label mb-3">Wallet</div>
        <div className="mono text-sm break-all">{data.wallet}</div>
        <div className="grid grid-cols-3 mt-6 gap-px bg-[var(--color-line-strong)] border border-[var(--color-line-strong)]">
          <Stat k="Assets" v={data.totalAssets} />
          <Stat k="Collections" v={data.collections.length} />
          <Stat k="Flagged" v={flagged.length} />
        </div>
      </div>

      <Section label="Holdings">
        <ul className="divide-y divide-[var(--color-line)]">
          {data.collections.map((c: any) => (
            <li key={c.address} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {c.sample?.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.sample.image} alt="" className="w-10 h-10 object-cover border border-[var(--color-line)]" />
                )}
                <div className="min-w-0">
                  <div className="text-sm truncate">{c.sample?.name ?? "Unnamed"}</div>
                  <div className="mono text-[10px] tracking-wider uppercase text-[var(--color-muted)] truncate">
                    {c.address}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {c.suspicious && (
                  <span className="mono text-[10px] tracking-widest uppercase" style={{ color: "var(--color-bad)" }}>
                    suspicious
                  </span>
                )}
                {c.verified && (
                  <span className="mono text-[10px] tracking-widest uppercase" style={{ color: "var(--color-ok)" }}>
                    verified
                  </span>
                )}
                <div className="mono text-sm tabular-nums">×{c.count}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="bg-[var(--color-bg)] p-5">
      <div className="label mb-2">{k}</div>
      <div className="display text-3xl tabular-nums">{v}</div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="label mb-4">{label}</div>
      {children}
    </section>
  );
}
