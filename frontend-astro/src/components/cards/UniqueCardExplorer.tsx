import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Loader2, ScanSearch, Search, Wand2, X, Zap,
} from 'lucide-react';
import { api } from '@api/client';
import { cardImageSrc, setPlaceholderImage } from '@utils/images';

interface Pattern {
  key: string;
  label: string;
}

interface UniqueCard {
  card_id: string;
  name: string;
  image_url: string;
  card_type?: string;
  evolution_stage?: string;
  hp?: number;
  expansion_code?: string;
  collector_number?: string;
  regulation_mark?: string;
  patterns: Pattern[];
  ability_names?: string[];
  ability_texts?: string[];
  attack_summary?: string[];
  why: string[];
  score: number;
}

interface UniqueResponse {
  cards: UniqueCard[];
  total: number;
  patterns: Pattern[];
  pattern_counts: Record<string, number>;
}

const PAGE_SIZE = 24;

const PATTERN_COLORS: Record<string, string> = {
  bench_attacker: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  energy_manip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  energy_accel: 'bg-green-500/15 text-green-400 border-green-500/30',
  damage_counter: 'bg-red-500/15 text-red-400 border-red-500/30',
  punish: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  draw_engine: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  disruption: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  protection: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  healing: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  spread: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  multi_attack: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  efficiency: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
};

export default function UniqueCardExplorer() {
  const [data, setData] = useState<UniqueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pattern, setPattern] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fetchCards = useCallback(async (p: string, q: string, off: number) => {
    setLoading(true);
    setError(null);
    const res = await api.getUniqueEngineCards({ pattern: p || undefined, q: q || undefined, limit: PAGE_SIZE, offset: off });
    if (res.success && res.data) {
      setData(res.data as UniqueResponse);
    } else {
      setError(res.error || 'Gagal memuat kartu unik');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const t = window.setTimeout(() => fetchCards(pattern, query, offset), query ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [mounted, pattern, query, offset, fetchCards]);

  const total = data?.total || 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ScanSearch className="h-5 w-5 text-primary" />
          Detektor Kartu Unik
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          Pemindai otomatis seluruh pool regulation H/I/J, lalu mengklasifikasi kartu berdasarkan
          pola ability & serangan: pemakai serangan bench, manipulasi energi, Token Kerusakan,
          punish saat KO, draw engine, disrupsi, proteksi, healing, spread damage, dan damage
          efisien. Klik <strong className="text-foreground">Build Deck</strong> untuk menyusun
          deck 60-kartu di sekitar kartu pilihan.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOffset(0); }}
          placeholder="Cari nama kartu (mis. Mew ex, Bronzong, Greninja)..."
          className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Pattern filters */}
      {data?.patterns && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setPattern(''); setOffset(0); }}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
              pattern === '' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40'
            }`}
          >
            Semua ({total})
          </button>
          {data.patterns
            .filter((p) => (data.pattern_counts?.[p.key] || 0) > 0)
            .sort((a, b) => (data.pattern_counts?.[b.key] || 0) - (data.pattern_counts?.[a.key] || 0))
            .map((p) => (
              <button
                key={p.key}
                onClick={() => { setPattern(pattern === p.key ? '' : p.key); setOffset(0); }}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                  pattern === p.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : PATTERN_COLORS[p.key] || 'border-border bg-card text-muted-foreground'
                }`}
              >
                {p.label}
                <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">
                  {data.pattern_counts?.[p.key] || 0}
                </span>
              </button>
            ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
          Memindai {total > 0 ? total : ''} kartu unik...
        </div>
      ) : (data?.cards || []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          {query || pattern
            ? 'Tidak ada kartu yang cocok dengan pencarian atau filter ini.'
            : 'Belum ada kartu unik terdeteksi.'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(data?.cards || []).map((c) => (
            <article key={c.card_id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40">
              <div className="flex gap-3 p-3">
                <img
                  src={cardImageSrc(c.image_url)}
                  onError={setPlaceholderImage}
                  alt={c.name}
                  loading="lazy"
                  className="h-28 w-20 shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <a href={`/cards/detail?id=${encodeURIComponent(c.card_id)}`} className="truncate text-sm font-bold hover:text-primary">
                      {c.name}
                    </a>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground" title="Uniqueness score">
                      {c.score}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.expansion_code} {c.collector_number}
                    {c.hp ? ` • ${c.hp} HP` : ''}
                    {c.card_type ? ` • ${c.card_type}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.patterns.map((p) => (
                      <span key={p.key} className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${PATTERN_COLORS[p.key] || 'border-border bg-muted text-muted-foreground'}`}>
                        {p.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1 border-t border-border/60 px-3 py-2">
                {c.ability_names && c.ability_names.length > 0 ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    <Zap className="mr-1 inline h-3 w-3 text-primary" />
                    <span className="font-semibold text-foreground">{c.ability_names[0]}</span>
                    {c.ability_texts?.[0] ? `: ${c.ability_texts[0].slice(0, 110)}${c.ability_texts[0].length > 110 ? '…' : ''}` : ''}
                  </p>
                ) : c.attack_summary && c.attack_summary.length > 0 ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    <Zap className="mr-1 inline h-3 w-3 text-primary" />
                    {c.attack_summary[0]}
                  </p>
                ) : null}
              </div>
              <a
                href={`/decks?tab=builder&engine=${encodeURIComponent(c.card_id)}`}
                className="flex h-9 items-center justify-center gap-1.5 border-t border-border bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Bangun Deck
              </a>
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Halaman {page} / {totalPages} • {total} kartu
          </p>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-40 hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" /> Sebelumnya
            </button>
            <button
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-40 hover:bg-accent"
            >
              Berikutnya <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
