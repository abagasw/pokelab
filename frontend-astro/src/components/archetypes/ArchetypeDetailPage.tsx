import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Award, BarChart3, ChevronRight, Flame, Layers3, Shield,
  Search, Swords, Target, TrendingUp, Trophy, Users,
} from 'lucide-react';
import { useResearchStore } from '../../stores/researchStore';
import { useDeckStore } from '../../stores/deckStore';
import { api } from '../../api/client';
import type { MetaDeckPrediction, AntiMetaRecommendation } from '@/types/index';

function slugToName(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, ' ').trim();
}

export default function ArchetypeDetailPage() {
  const [name, setName] = useState<string>('');
  const [antiMeta, setAntiMeta] = useState<AntiMetaRecommendation[] | null>(null);
  const [antiMetaLoading, setAntiMetaLoading] = useState(false);

  const { archetypes, loading, error, fetchForecast } = useResearchStore();
  const { decks, loading: decksLoading, fetchDecks } = useDeckStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setName(params.get('name') ? slugToName(params.get('name')!) : '');
    fetchForecast(undefined, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const archetype: MetaDeckPrediction | null = useMemo(() => {
    if (!archetypes.length || !name) return null;
    const lower = name.toLowerCase();
    return (
      archetypes.find((a) => a.archetype.toLowerCase() === lower) ||
      archetypes.find((a) => a.archetype.toLowerCase().includes(lower)) ||
      archetypes.find((a) => lower.includes(a.archetype.toLowerCase())) ||
      null
    );
  }, [archetypes, name]);

  // Load decks belonging to this archetype for the representative list
  useEffect(() => {
    if (name) fetchDecks({ q: name, limit: 120 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Load anti-meta counters for the representative deck
  useEffect(() => {
    if (!archetype?.representative_deck_id) return;
    let cancelled = false;
    setAntiMetaLoading(true);
    api.getAntiMeta(archetype.representative_deck_id).then((res) => {
      if (!cancelled) setAntiMeta(res.success && res.data ? res.data : []);
    }).finally(() => {
      if (!cancelled) setAntiMetaLoading(false);
    });
    return () => { cancelled = true; };
  }, [archetype?.representative_deck_id]);

  if (!name) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <BarChart3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
        <h1 className="mb-2 text-2xl font-bold">Archetype tidak ditemukan</h1>
        <p className="mb-6 text-muted-foreground">Parameter <code className="rounded bg-muted px-1.5 py-0.5">?name=</code> wajib diisi.</p>
        <a href="/decks" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Kembali ke Archetypes
        </a>
      </div>
    );
  }

  if (loading && !archetype) {
    return (
      <div className="container px-6 py-10 md:px-8">
        <div className="mb-8 h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!archetype) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <Target className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
        <h1 className="mb-2 text-2xl font-bold">&quot;{name}&quot; tidak ada di meta</h1>
        <p className="mb-6 text-muted-foreground">
          {error || 'Archetype ini belum memiliki sinyal turnamen yang cukup.'}
        </p>
        <a href="/decks" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Lihat semua archetype
        </a>
      </div>
    );
  }

  const winRate = archetype.tournament_count > 0
    ? Math.round((archetype.win_count / archetype.tournament_count) * 100) : null;
  const top8Rate = archetype.tournament_count > 0
    ? Math.round((archetype.top8_count / archetype.tournament_count) * 100) : null;
  const consistency = Math.round((archetype.confidence_pct + (winRate ?? 0) + (top8Rate ?? 0)) / 3);

  return (
    <div className="container px-6 py-10 md:px-8">
      {/* Breadcrumb + back */}
      <div className="mb-6 flex items-center justify-between">
        <a href="/decks" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Semua Archetype
        </a>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Meta Intelligence</span>
      </div>

      {/* Header */}
      <header className="mb-8 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                {archetype.predicted_tier}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
                {archetype.growth_signal}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {archetype.expected_role}
              </span>
            </div>
            <h1 className="text-3xl font-bold">{archetype.archetype}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {archetype.forecast_reason}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {archetype.representative_deck_id && (
              <a
                href={`/decks/detail?id=${encodeURIComponent(archetype.representative_deck_id)}`}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Buka deck representatif
                <ChevronRight className="h-4 w-4" />
              </a>
            )}
            <span className="text-xs text-muted-foreground">{archetype.representative_deck_name}</span>
          </div>
        </div>
      </header>

      {/* Metrics grid */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Trophy} label="Turnamen" value={archetype.tournament_count.toString()} sub="sinyal kompetitif" />
        <MetricCard icon={Award} label="Decklist" value={archetype.deck_count.toString()} sub="variasi terdata" />
        <MetricCard icon={Target} label="Win Rate" value={winRate !== null ? `${winRate}%` : '-'} sub={`${archetype.win_count} kemenangan`} />
        <MetricCard icon={Award} label="Top 8 Rate" value={top8Rate !== null ? `${top8Rate}%` : '-'} sub={`${archetype.top8_count} top cut`} />
      </section>

      {/* Model scores */}
      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <BarChart3 className="h-4 w-4 text-primary" />
            Skor Model Matematis
          </h2>
          <div className="space-y-4">
            <ScoreBar label="Prediction Score" value={archetype.prediction_score} />
            <ScoreBar label="Confidence" value={archetype.confidence_pct} color="blue" />
            <ScoreBar label="Momentum" value={archetype.momentum_score} color="amber" />
            <ScoreBar label="Consistency" value={consistency} color="emerald" />
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <Users className="h-4 w-4 shrink-0 text-primary" />
            Meta share <strong className="text-foreground">{archetype.meta_share_pct.toFixed(1)}%</strong> dari seluruh sinyal turnamen
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            Driver & Risiko
          </h2>
          <div className="mb-4 space-y-2">
            {archetype.drivers.map((d, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs">
                <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{d}</span>
              </div>
            ))}
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Risk Factors</p>
          <div className="space-y-2">
            {archetype.risk_factors.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/70" />
                {r}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Deck list browser */}
      <section className="mb-8">
        <ArchetypeDeckBrowser decks={decks} loading={decksLoading} archetypeName={archetype.archetype} />
      </section>

      {/* Counter decks (anti-meta) */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Swords className="h-4 w-4 text-primary" />
          Counter Deck Rekomendasi
        </h2>
        {antiMetaLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : antiMeta && antiMeta.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {antiMeta.slice(0, 6).map((rec) => (
              <div key={rec.counter_deck_id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{rec.counter_deck_name}</span>
                  <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                    {rec.counter_score}
                  </span>
                </div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{rec.archetype}</p>
                {rec.tech_cards.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {rec.tech_cards.slice(0, 4).map((t, i) => (
                      <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
                    ))}
                  </div>
                )}
                <a
                  href={`/decks/detail?id=${encodeURIComponent(rec.counter_deck_id)}`}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Lihat counter deck <ChevronRight className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
            <Flame className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            Belum ada rekomendasi counter. Coba lagi setelah data turnamen baru tersinkron.
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="font-mono text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function ScoreBar({ label, value, color = 'primary' }: { label: string; value: number; color?: string }) {
  const bars: Record<string, string> = {
    primary: 'bg-primary', blue: 'bg-blue-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500',
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="font-mono font-bold">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-500 ${bars[color]}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

/**
 * Deck list browser for one archetype: search, format filter, and stats sorting
 * applied client-side over the decks the API returns for the archetype name.
 */
function ArchetypeDeckBrowser({ decks, loading, archetypeName }: {
  decks: { id: string; name: string; format?: string; tournament_count?: number; win_count?: number; top8_count?: number }[];
  loading: boolean;
  archetypeName: string;
}) {
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('');
  const [sort, setSort] = useState('tournaments');

  const formats = useMemo(() => {
    const set = new Set<string>();
    for (const d of decks) if (d.format) set.add(d.format);
    return Array.from(set).sort();
  }, [decks]);

  const winRate = (d: typeof decks[number]) =>
    d.tournament_count ? Math.round((d.win_count || 0) / d.tournament_count * 100) : 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = decks.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (format && d.format !== format) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      switch (sort) {
        case 'wins': return (b.win_count || 0) - (a.win_count || 0);
        case 'winrate': return winRate(b) - winRate(a);
        case 'top8': return (b.top8_count || 0) - (a.top8_count || 0);
        case 'name': return a.name.localeCompare(b.name);
        default: return (b.tournament_count || 0) - (a.tournament_count || 0);
      }
    });
  }, [decks, query, format, sort]);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Layers3 className="h-4 w-4 text-primary" aria-hidden="true" />
          {visible.length} deck dalam {archetypeName}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Cari deck</span>
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama deck..."
              className="h-9 w-44 rounded-md border border-input bg-background pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {formats.length > 1 && (
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              aria-label="Filter format"
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Semua format</option>
              {formats.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Urutkan"
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="tournaments">Turnamen terbanyak</option>
            <option value="winrate">Win rate tertinggi</option>
            <option value="wins">Kemenangan terbanyak</option>
            <option value="top8">Top 8 terbanyak</option>
            <option value="name">Nama A-Z</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {decks.length === 0
            ? 'Belum ada decklist yang terkait dengan archetype ini di database.'
            : 'Tidak ada deck yang cocok dengan filter.'}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((deck) => (
            <li key={deck.id}>
              <a
                href={`/decks/detail?id=${encodeURIComponent(deck.id)}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{deck.name}</span>
                {deck.format && (
                  <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {deck.format}
                  </span>
                )}
                <span className="shrink-0 font-mono text-xs text-muted-foreground" title="Turnamen">
                  {deck.tournament_count || 0} tourn
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground" title="Win rate">
                  {winRate(deck)}% win
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground" title="Top 8">
                  {deck.top8_count || 0} top8
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
