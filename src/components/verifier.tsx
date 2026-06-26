"use client";
import { useRef, useState } from "react";
import { Button, Input } from "@/components/ui/primitives";
import { ResultPanel } from "@/components/result-panel";

type Tab = "address" | "image" | "url" | "wallet";

export function Verifier() {
  const [tab, setTab] = useState<Tab>("address");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  // input state per tab
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<string>("");
  const [url, setUrl] = useState("");
  const [wallet, setWallet] = useState("");
  const [walletChain, setWalletChain] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function submit() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      let res: Response;
      if (tab === "address") {
        res = await fetch("/api/verify/address", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: address.trim(), chain: chain || undefined }),
        });
      } else if (tab === "url") {
        const r1 = await fetch("/api/verify/url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        const parsed = await r1.json();
        if (!r1.ok) throw new Error(parsed.error ?? "URL parse failed");
        res = await fetch("/api/verify/address", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed),
        });
      } else if (tab === "wallet") {
        res = await fetch("/api/verify/wallet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: wallet.trim(), chain: walletChain || undefined }),
        });
      } else {
        // image
        const f = fileRef.current?.files?.[0];
        if (!f) throw new Error("choose an image");
        const fd = new FormData();
        fd.append("image", f);
        res = await fetch("/api/verify/image", { method: "POST", body: fd });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "verify failed");
      setResult({ kind: tab, data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "address", label: "Address" },
    { id: "image",   label: "Image" },
    { id: "url",     label: "URL" },
    { id: "wallet",  label: "Wallet" },
  ];

  return (
    <div>
      <div className="flex border-b border-[var(--color-line-strong)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setResult(null); setError(null); }}
            className={`mono text-[11px] tracking-[0.25em] uppercase px-5 h-12 border-r border-[var(--color-line)] last:border-r-0 transition-colors ${
              tab === t.id
                ? "text-[var(--color-fg)] bg-[var(--color-fg)]/[0.03]"
                : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="border-b border-r border-l border-[var(--color-line-strong)] p-8 space-y-6">
        {tab === "address" && (
          <>
            <Input
              autoFocus
              placeholder="0x… or Solana mint address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {["", "solana", "ethereum", "polygon", "base", "arbitrum", "optimism"].map((c) => (
                <ChainChip key={c || "auto"} active={chain === c} onClick={() => setChain(c)}>
                  {c || "auto"}
                </ChainChip>
              ))}
            </div>
          </>
        )}

        {tab === "url" && (
          <Input
            autoFocus
            placeholder="magiceden.io / tensor.trade / opensea.io / blur.io link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}

        {tab === "wallet" && (
          <>
            <Input
              autoFocus
              placeholder="Wallet address — holdings + scam flags"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {["", "solana", "ethereum", "polygon", "base", "arbitrum", "optimism"].map((c) => (
                <ChainChip key={c || "auto"} active={walletChain === c} onClick={() => setWalletChain(c)}>
                  {c || "auto"}
                </ChainChip>
              ))}
            </div>
          </>
        )}

        {tab === "image" && (
          <div className="flex items-start gap-6">
            <label
              htmlFor="img"
              className="block w-44 h-44 border border-[var(--color-line-strong)] flex items-center justify-center cursor-pointer hover:border-[var(--color-fg)] transition-colors overflow-hidden bg-[var(--color-surface)]"
            >
              {imagePreview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <span className="mono text-[10px] tracking-widest uppercase text-[var(--color-muted)] text-center px-4">
                  Drop NFT image<br />or click
                </span>
              )}
            </label>
            <input id="img" type="file" accept="image/*" ref={fileRef} onChange={onFile} className="hidden" />
            <div className="flex-1 space-y-3 pt-2">
              <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                We compute a perceptual hash and match it against indexed blue-chip collections.
                If your image belongs to one, we identify it — and flag mismatched contracts as copycats.
              </p>
              {fileName && <div className="mono text-xs text-[var(--color-muted)]">{fileName}</div>}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="mono text-[10px] tracking-widest uppercase text-[var(--color-muted)]">
            {error ? <span className="text-[var(--color-bad)]">{error}</span> : "Press verify"}
          </div>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Verifying…" : "Verify"}
          </Button>
        </div>
      </div>

      {result != null && <ResultPanel result={result as { kind: Tab; data: unknown }} />}
    </div>
  );
}

function ChainChip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`mono text-[10px] tracking-widest uppercase h-7 px-3 border transition-colors ${
        active
          ? "border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]"
          : "border-[var(--color-line-strong)] text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-fg)]"
      }`}
    >
      {children}
    </button>
  );
}
