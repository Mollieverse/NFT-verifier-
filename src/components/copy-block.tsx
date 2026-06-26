"use client";
import { useState } from "react";

export function CopyValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="flex items-center gap-4 py-3 border-b border-[var(--color-line)]">
      {label && <span className="label w-28 shrink-0">{label}</span>}
      <code className="mono text-xs flex-1 truncate">{value}</code>
      <button onClick={onCopy} className="mono text-[10px] tracking-widest uppercase text-[var(--color-muted)] hover:text-[var(--color-fg)]">
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
