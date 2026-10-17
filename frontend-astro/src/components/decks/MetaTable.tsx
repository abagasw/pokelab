import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ChevronRight, Loader2, Minus, Radar,
} from 'lucide-react';
import { useResearchStore } from '../../stores/researchStore';
import { api } from '../../api/client';
import { cardImageSrc, setPlaceholderImage } from '@utils/images';
import type { MetaDeckPrediction } from '@/types/index';

interface UniqueCardLite {
  card_id: string;
  name: string;
  image_url: string;
  expansion_code?: string;
  collector_number?: string;
  patterns: { key: string; label: string }[];
}

type SortKey = 'rank' | 'count' | 'share' | 'winrate' | 'score' | 'momentum' | 'confidence';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rank', label: '#' },
  { key: 'count', label: 'Deck' },
  { key: 'share', label: 'Share' },
  { key: 'winrate', label: 'Win %' },
  { key: 'score', label: 'Skor ML' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'confidence', label: 'Keyakinan' },
];

export default function MetaTable() {
  const { archetypes, loading, error, fetchForecast } = useResearchStore();
  const [mounted, setMounted] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [query, setQuery] = useState('');
  const [radar, setRadar] = useState<UniqueCardLite[]>([]);
  const [radarLoading, setRadarLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchForecast(undefined, 500);
    setRadarLoading(true);
    api.getUniqueEngineCards({ sort: 'newest', limit: 14 }).then((res) => {
      if (res.success && res.data) setRadar((res.data as any).cards || []);
    }).finally(() => setRadarLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Win % prefers real match records (W-L-T from standings); falls back to
  // deck-level counters for archetypes without match data.
  const winRate = (a: MetaDeckPrediction) => {
    const m = (a as any);
    if ((m.match_wins || 0) + (m.match_losses || 0) + (m.match_ties || 0) > 0) {
      return Math.round((m.match_wins / (m.match_wins + m.match_losses + m.match_ties)) * 1000) / 10;
    }
    return a.tournament_count > 0 ? Math.round((a.win_count / a.tournament_count) * 1000) / 10 : 0;
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = archetypes.filter((a) => !q || a.archetype.toLowerCase().includes(q));
    const sorted = [...filtered];
    const cmp: Record<SortKey, (a: MetaDeckPrediction, b: MetaDeckPrediction) => number> = {
      rank: (a, b) => b.prediction_score - a.prediction_score || b.deck_count - a.deck_count,
      count: (a, b) => b.deck_count - a.deck_count,
      share: (a, b) => b.meta_share_pct - a.meta_share_pct,
      winrate: (a, b) => winRate(b) - winRate(a),
      score: (a, b) => b.prediction_score - a.prediction_score,
      momentum: (a, b) => b.momentum_score - a.momentum_score,
      confidence: (a, b) => b.confidence_pct - a.confidence_pct,
    };
    return sorted.sort(cmp[sortKey]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetypes, query, sortKey]);

  const mlPicks = useMemo(
    () => [...archetypes]
      .filter((a) => a.tournament_count >= 3)
      .sort((a, b) => b.prediction_score - a.prediction_score)
      .slice(0, 3),
    [archetypes],
  );

  const totals = useMemo(() => ({
    tournaments: archetypes.reduce((s, a) => s + a.tournament_count, 0),
    decklists: archetypes.reduce((s, a) => s + a.deck_count, 0),
    wins: archetypes.reduce((s, a) => s + a.win_count, 0),
  }), [archetypes]);

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        {loading && archetypes.length === 0 ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat meta...
          </span>
        ) : (
          <>
            <span><strong className="font-mono">{archetypes.length}</strong> archetype</span>
            <span aria-hidden="true" className="text-muted-foreground">·</span>
            <span><strong className="font-mono">{totals.decklists.toLocaleString('id-ID')}</strong> decklist</span>
            <span aria-hidden="true" className="text-muted-foreground">·</span>
            <span><strong className="font-mono">{totals.tournaments.toLocaleString('id-ID')}</strong> match tercatat</span>
            <span aria-hidden="true" className="text-muted-foreground">·</span>
            <span><strong className="font-mono">{totals.wins.toLocaleString('id-ID')}</strong> kemenangan</span>
          </>
        )}
        <label className="relative">
          <span className="sr-only">Cari archetype</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari archetype..."
            className="h-9 w-52 rounded-md border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>

      {/* ML picks */}
      {mlPicks.length > 0 && (
        <section aria-labelledby="ml-picks-head">
          <h2 id="ml-picks-head" className="mb-2 text-sm font-bold">
            Pilihan ML: probabilitas menang tertinggi
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            {mlPicks.map((a, i) => (
              <a
                key={a.archetype}
                href={`/decks/archetype?name=${encodeURIComponent(a.archetype.toLowerCase().replace(/\s+/g, '-'))}`}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-sm font-bold text-primary">
                  {i + 1}
                </span>
                {(a as any).key_cards?.length > 0 && (
                  <img
                    src={cardImageSrc((a as any).key_cards[0].image_url)}
                    onError={setPlaceholderImage}
                    alt=""
                    className="hidden h-12 w-9 shrink-0 rounded-sm object-cover sm:block"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold group-hover:text-primary">{a.archetype}</p>
                  <p className="text-xs text-muted-foreground">
                    Skor ML {a.prediction_score} · keyakinan {a.confidence_pct}% · win rate {winRate(a)}% dari {a.tournament_count} turnamen
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Unique card radar */}
      <section aria-labelledby="radar-head">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="radar-head" className="flex items-center gap-2 text-sm font-bold">
            <Radar className="h-4 w-4 text-primary" aria-hidden="true" />
            Radar kartu unik terbaru
          </h2>
          <a href="/cards/unique" className="text-xs font-semibold text-primary hover:underline">
            Lihat semua
          </a>
        </div>
        {radarLoading ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 w-24 shrink-0 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : radar.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
            Belum ada kartu unik terdeteksi.
          </div>
        ) : (
          <ul className="flex gap-3 overflow-x-auto pb-2">
            {radar.map((c) => (
              <li key={c.card_id} className="w-24 shrink-0">
                <a
                  href={`/cards/detail?id=${encodeURIComponent(c.card_id)}`}
                  className="group block rounded-lg border border-border bg-card p-1.5 transition-colors hover:border-primary/50"
                >
                  <img
                    src={cardImageSrc(c.image_url)}
                    onError={setPlaceholderImage}
                    alt={c.name}
                    loading="lazy"
                    className="aspect-[3/4] w-full rounded-md object-cover"
                  />
                  <p className="mt-1.5 truncate text-[11px] font-semibold group-hover:text-primary">{c.name}</p>
                  <p className="truncate text-[9px] text-muted-foreground">
                    {c.expansion_code} {c.collector_number}
                  </p>
                  {c.patterns[0] && (
                    <p className="mt-0.5 truncate rounded bg-primary/10 px-1 py-0.5 text-center text-[8px] font-bold text-primary">
                      {c.patterns[0].label}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Meta table */}
      <section aria-label="Tabel meta deck">
        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading && archetypes.length === 0 ? (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
                <div className="h-4 w-6 animate-pulse rounded bg-muted" />
                <div className="h-4 w-44 animate-pulse rounded bg-muted" />
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            Tidak ada archetype yang cocok dengan pencarian.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {SORTS.map((s) => (
                    <th key={s.key} className={s.key === 'rank' ? 'w-10 px-3 py-2.5' : 'px-3 py-2.5'}>
                      <button
                        onClick={() => setSortKey(s.key)}
                        aria-label={`Urutkan berdasarkan ${s.label}`}
                        className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide transition-colors hover:text-foreground ${
                          sortKey === s.key ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {s.label}
                        {sortKey === s.key && (s.key === 'rank' ? null : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Rekor</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-muted-foreground">Tren</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const wr = winRate(a);
                  const growth =
                    a.growth_signal === 'surging' || a.growth_signal === 'rising'
                      ? 'up'
                      : a.growth_signal === 'consolidating'
                        ? 'flat'
                        : 'down';
                  return (
                    <tr key={a.archetype} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="max-w-[280px] px-3 py-2">
                        <a
                          href={`/decks/archetype?name=${encodeURIComponent(a.archetype.toLowerCase().replace(/\s+/g, '-'))}`}
                          className="group flex items-center gap-2"
                        >
                          <span className="flex -space-x-2">
                            {((a as any).key_cards || []).slice(0, 3).map((k: any) => (
                              <img
                                key={k.card_id}
                                src={cardImageSrc(k.image_url)}
                                onError={setPlaceholderImage}
                                alt=""
                                loading="lazy"
                                className="h-9 rounded-sm border border-card object-cover"
                                style={{ width: 26 }}
                              />
                            ))}
                          </span>
                          <span className="truncate font-medium group-hover:text-primary">{a.archetype}</span>
                        </a>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{a.deck_count}</td>
                      <td className="px-3 py-2 font-mono text-xs">{a.meta_share_pct.toFixed(1)}%</td>
                      <td className="px-3 py-2 font-mono text-xs">{wr > 0 ? `${wr}%` : '-'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold">
                          {a.prediction_score}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                          <span className="h-full rounded-full bg-amber-500" style={{ width: `${a.momentum_score}%` }} />
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                          <span className="h-full rounded-full bg-emerald-500" style={{ width: `${a.confidence_pct}%` }} />
                        </span>
                      </td>
                      <td
                        className="px-3 py-2 font-mono text-xs text-muted-foreground"
                        title={`${a.win_count} kemenangan deck-level, ${a.top8_count} top cut`}
                      >
                        {((a as any).match_wins || 0) + ((a as any).match_losses || 0) + ((a as any).match_ties || 0) > 0
                          ? `${(a as any).match_wins} - ${(a as any).match_losses} - ${(a as any).match_ties}`
                          : `${a.win_count}W · ${a.top8_count}T8`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {growth === 'up' && <ArrowUp className="ml-auto h-4 w-4 text-emerald-500" aria-label="Naik" />}
                        {growth === 'flat' && <Minus className="ml-auto h-4 w-4 text-muted-foreground" aria-label="Stabil" />}
                        {growth === 'down' && <ArrowDown className="ml-auto h-4 w-4 text-red-400" aria-label="Turun" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Journey guidance for first-time users */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        <span>Baru di sini?</span>
        <a href="/decks/archetype?name=dragapult" className="font-semibold text-primary hover:underline">klik archetype untuk lihat decklist</a>
        <span>lalu</span>
        <a href="/decks?tab=builder" className="font-semibold text-primary hover:underline">bangun deck sendiri</a>
        <span>atau</span>
        <a href="/lab" className="font-semibold text-primary hover:underline">jelajahi alat riset</a>
      </div>
    </div>
  );
}
