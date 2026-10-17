import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Info, Loader2, MapPin, Sparkle,
} from 'lucide-react';
import { api } from '@api/client';

interface Signal {
  archetype: string;
  jp_deck_count: number;
  jp_share_pct: number;
  jp_topcut_rate: number;
  jp_recent_count: number;
  global_share_pct: number;
  breakout_score: number;
  verdict: string;
  reason: string;
}

const VERDICT_STYLE: Record<string, { badge: string; ring: string; label: string }> = {
  'Kandidat meta global': {
    badge: 'bg-amber-500 text-black',
    ring: 'border-amber-500/60 bg-amber-500/[0.07]',
    label: 'Kandidat meta global',
  },
  'Mulai muncul di global': {
    badge: 'bg-blue-500 text-white',
    ring: 'border-blue-500/40',
    label: 'Mulai muncul',
  },
  'Sudah meta global': {
    badge: 'bg-emerald-500 text-white',
    ring: 'border-emerald-500/40',
    label: 'Sudah meta global',
  },
  'Pantau': {
    badge: 'bg-muted text-muted-foreground',
    ring: 'border-border',
    label: 'Pantau',
  },
};

const PAGE_SIZE = 9;

/**
 * Sinyal dari Jepang: fitur utama PokeLab.
 * Rilis JP memimpin global 3-6 bulan; deck yang ramai di City League JP
 * namun belum muncul di meta internasional = kandidat meta global berikutnya.
 */
export default function JPSignalBoard() {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMethod, setOpenMethod] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    api.getJPForecast(200).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setSignals((res.data as any).signals || []);
      } else {
        setError(res.error || 'Gagal memuat sinyal Jepang');
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => {
    const counts = { kandidat: 0, muncul: 0, sudah: 0, pantau: 0 };
    for (const s of signals || []) {
      if (s.verdict === 'Kandidat meta global') counts.kandidat++;
      else if (s.verdict === 'Mulai muncul di global') counts.muncul++;
      else if (s.verdict === 'Sudah meta global') counts.sudah++;
      else counts.pantau++;
    }
    return counts;
  }, [signals]);

  const totalPages = Math.max(1, Math.ceil((signals?.length || 0) / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = (signals || []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (loading) {
    return (
      <section className="mb-6 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.08] to-transparent px-4 py-8">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Menghitung sinyal dari 13.000+ decklist City League Jepang...
        </div>
      </section>
    );
  }

  if (error || !signals || signals.length === 0) {
    return null; // fail silently; the global board below still works
  }

  return (
    <section
      aria-labelledby="jp-signal-head"
      className="mb-8 overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-500/[0.10] via-amber-500/[0.03] to-transparent"
    >
      {/* Hero header */}
      <div className="border-b border-amber-500/25 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-500">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Fitur Utama PokeLab
            </p>
            <h2 id="jp-signal-head" className="text-xl font-black tracking-tight md:text-2xl">
              Sinyal dari Jepang: deck yang berpotensi jadi meta global
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              Rilis Jepang memimpin global 3-6 bulan. Deck yang ramai dimainkan di City League JP
              tapi belum muncul di turnamen internasional adalah kandidat terkuat meta berikutnya.
            </p>
          </div>
          <button
            onClick={() => setOpenMethod(!openMethod)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 text-xs font-semibold text-amber-500 hover:bg-amber-500/10"
            aria-expanded={openMethod}
          >
            <Info className="h-3.5 w-3.5" />
            Cara hitung
          </button>
        </div>

        {/* Summary strip */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryPill label="Kandidat meta global" value={summary.kandidat} tone="amber" />
          <SummaryPill label="Mulai muncul" value={summary.muncul} tone="blue" />
          <SummaryPill label="Sudah meta global" value={summary.sudah} tone="emerald" />
          <SummaryPill label="Pantau" value={summary.pantau} tone="muted" />
        </div>

        {openMethod && (
          <p className="mt-3 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Skor breakout = share JP x 8 + top-cut rate JP x 0.8 + aktivitas 30 hari + bonus 15 bila
            share global di bawah 1%. Verdict "Kandidat meta global" diberikan bila skor tinggi dan
            deck belum ada di meta internasional. Nama archetype diturunkan dari ikon Pokemon pada
            decklist JP; pencocokan global memakai token overlap.
          </p>
        )}
      </div>

      {/* Signal cards */}
      <ul className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((s) => {
          const v = VERDICT_STYLE[s.verdict] || VERDICT_STYLE['Pantau'];
          const highlight = s.verdict === 'Kandidat meta global';
          return (
            <li key={s.archetype}>
              <a
                href={`/decks/archetype?name=${encodeURIComponent(s.archetype.toLowerCase().replace(/\s+/g, '-'))}`}
                className={`group block h-full rounded-xl border bg-card p-4 transition-colors ${v.ring} hover:border-amber-500/70`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className={`min-w-0 truncate text-sm font-bold ${highlight ? 'group-hover:text-amber-500' : 'group-hover:text-primary'}`}>
                    {s.archetype}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${v.badge}`}>
                    {v.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 font-mono text-[11px] text-muted-foreground">
                  <span title="Jumlah deck di City League JP">{s.jp_deck_count} deck JP</span>
                  <span title="Top-cut rate JP">{s.jp_topcut_rate}% top cut</span>
                  <span title="Share di meta global saat ini">
                    {s.global_share_pct < 0.1 ? '<0.1' : s.global_share_pct}% global
                  </span>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] leading-4 text-muted-foreground">
                  {highlight && <Sparkle className="h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />}
                  <span className="truncate" title={s.reason}>
                    skor breakout {s.breakout_score}
                    {s.jp_recent_count > 0 ? ` · ${s.jp_recent_count} deck 30 hari terakhir` : ''}
                  </span>
                </p>
              </a>
            </li>
          );
        })}
      </ul>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-amber-500/25 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Halaman {safePage} dari {totalPages} · {signals.length} sinyal JP
          </p>
          <div className="flex gap-2">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-40 hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" /> Sebelumnya
            </button>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-40 hover:bg-accent"
            >
              Berikutnya <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'blue' | 'emerald' | 'muted' }) {
  const tones: Record<string, string> = {
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
    blue: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
    muted: 'border-border bg-muted/50 text-muted-foreground',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <p className="font-mono text-lg font-black leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}
