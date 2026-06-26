import * as React from "react";

type Variant = "solid" | "ghost";

export function Button({
  variant = "solid",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "mono inline-flex items-center justify-center h-11 px-5 text-[11px] tracking-widest uppercase border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const styles: Record<Variant, string> = {
    solid:
      "bg-[var(--color-fg)] text-[var(--color-bg)] border-[var(--color-fg)] hover:bg-[var(--color-bg)] hover:text-[var(--color-fg)]",
    ghost:
      "bg-transparent border-[var(--color-line-strong)] hover:border-[var(--color-fg)]",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`mono w-full h-12 px-0 text-base bg-transparent border-0 border-b border-[var(--color-line-strong)] focus:outline-none focus:border-[var(--color-fg)] placeholder:text-[var(--color-faint)] ${props.className ?? ""}`}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="label mb-2">{label}</div>
      {children}
    </div>
  );
}

export function Divider() {
  return <div className="h-px bg-[var(--color-line-strong)] w-full" />;
}
