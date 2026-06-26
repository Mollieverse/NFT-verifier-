import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <div className="max-w-3xl mx-auto px-8 pt-20 pb-24">
      <div className="label mb-6">recent verifications</div>
      <h1 className="display text-5xl mb-12">History</h1>

      {reports.length === 0 ? (
        <div className="border border-dashed border-[var(--color-line-strong)] p-12 text-center mono text-xs tracking-widest uppercase text-[var(--color-muted)]">
          No reports yet
        </div>
      ) : (
        <ul className="border-t border-[var(--color-line)]">
          {reports.map((r) => {
            const parsed = safeParse(r.result);
            const name =
              parsed?.name ?? parsed?.bestMatch?.collection?.name ?? parsed?.wallet ?? r.input;
            const verdict = parsed?.risk?.verdict;
            return (
              <li key={r.id} className="border-b border-[var(--color-line)] py-5 flex items-center justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{name}</div>
                  <div className="mono text-[10px] tracking-wider uppercase text-[var(--color-muted)] mt-1">
                    {r.inputType} · {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>
                {verdict && (
                  <span
                    className="mono text-[10px] tracking-widest uppercase"
                    style={{
                      color:
                        verdict === "verified" ? "var(--color-ok)"
                        : verdict === "caution" ? "var(--color-warn)"
                        : verdict === "fake"    ? "var(--color-bad)"
                        : "var(--color-muted)",
                    }}
                  >
                    {verdict}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function safeParse(s: string): any | null {
  try { return JSON.parse(s); } catch { return null; }
}
