import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Brain, Loader2, Search, Puzzle, Wand2, Zap, Shield, Target, HelpCircle,
} from 'lucide-react';
import { api } from '@api/client';
import { useAuthStore, useCollectionStore } from '@stores/index';
import { cardImageSrc, setPlaceholderImage } from '@utils/images';

interface EngineCardOption {
  id: string;
  name_id: string;
  category: string;
  card_type?: string;
  image_url?: string;
  expansion_code?: string;
  collector_number?: string;
}

interface BuildResult {
  success: boolean;
  deck: {
    name: string;
    archetype: string;
    description: string;
    total_cards: number;
    owned_cards: number;
    completeness_pct: number;
    synergy_score: number;
    unique_score: number;
    cards: {
      card_id: string;
      card_name: string;
      category: string;
      card_type?: string;
      image_url?: string;
      count: number;
      owned: number;
      is_owned: boolean;
      source: string;
      ability?: string;
    }[];
  };
  engine_analysis: {
    pattern: string;
    pattern_label: string;
    ability_text?: string;
    energy_plan: string;
    legal_pool: string;
    reasoning: string[];
    attack_summary?: string[];
  };
}

const FEATURED_ENGINES = [
  { id: '73466', label: 'Mew ex', hint: 'Spiral Ingatan, pakai serangan bench' },
  { id: '73488', label: 'Gengar ex', hint: 'Vonis Mati, punish saat KO' },
  { id: '70960', label: 'Bronzong', hint: 'Triple Draw, draw engine' },
  { id: '73404', label: 'Alolan Exeggutor', hint: 'Scale Up, HP stack 6 energi' },
];

export default function EngineBuilder() {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<EngineCardOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<EngineCardOption | null>(null);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { authReady, isAuthenticated } = useAuthStore();
  const { collections, fetchCollections } = useCollectionStore();

  useEffect(() => {
    if (authReady && isAuthenticated) fetchCollections();
  }, [authReady, isAuthenticated, fetchCollections]);

  // Auto-build when arriving from a card detail CTA (?engine=<card_id>)
  const [autoBuilt, setAutoBuilt] = useState(false);
  useEffect(() => {
    if (autoBuilt) return;
    const engineId = new URLSearchParams(window.location.search).get('engine');
    if (engineId) {
      setAutoBuilt(true);
      build(engineId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced card search (Pokemon with abilities preferred)
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2 || selected) {
      setOptions([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      const res = await api.searchCards({ q: query.trim(), limit: 8, regulation: 'standard' });
      if (res.success && res.data) {
        setOptions(
          (res.data.cards || []).filter((c: EngineCardOption) => c.category === 'Pokemon'),
        );
      }
      setSearching(false);
    }, 350);
    return () => window.clearTimeout(t);
  }, [query, selected]);

  const build = async (cardId: string) => {
    setBuilding(true);
    setError(null);
    setResult(null);
    const collectionId = isAuthenticated && collections.length > 0 ? collections[0].id : undefined;
    const res = await api.buildDeckAround(cardId, collectionId);
    if (res.success && res.data) {
      setResult(res.data as BuildResult);
    } else {
      setError(res.error || 'Gagal membangun deck');
    }
    setBuilding(false);
  };

  const grouped = useMemo(() => {
    if (!result) return null;
    const g: Record<string, BuildResult['deck']['cards']> = { Pokemon: [], Trainer: [], Energy: [] };
    for (const c of result.deck.cards) {
      (g[c.category] = g[c.category] || []).push(c);
    }
    return g;
  }, [result]);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Wand2 className="h-5 w-5 text-primary" />
            Engine Deck Builder
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pilih satu kartu unik (mis. Mew ex, Gengar ex, Bronzong). Sistem mendeteksi pola
            synergy dari teks ability/serangan lalu menyusun deck 60-kartu legal dari
            co-occurrence turnamen nyata. Deterministik, bukan AI generative.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={selected ? selected.name_id : query}
            onChange={(e) => { setSelected(null); setResult(null); setQuery(e.target.value); }}
            placeholder="Cari kartu engine (mis. Mew ex, Bronzong, Alolan Exeggutor)..."
            className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-24 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {selected && (
            <button
              onClick={() => { setSelected(null); setResult(null); setQuery(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-accent"
            >
              ganti
            </button>
          )}
          {!selected && query.trim().length >= 2 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {searching ? 'mencari...' : `${options.length} hasil`}
            </span>
          )}
        </div>

        {!selected && options.length > 0 && (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => { setSelected(o); setQuery(o.name_id); setOptions([]); build(o.id); }}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-2 text-left transition-colors hover:border-primary/50"
              >
                <img
                  src={cardImageSrc(o.image_url)}
                  onError={setPlaceholderImage}
                  alt={o.name_id}
                  className="h-12 w-9 rounded object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.name_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.expansion_code} {o.collector_number}
                  </p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Featured engines */}
      {!selected && !result && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Engine unik populer
          </p>
          <div className="flex flex-wrap gap-2">
            {FEATURED_ENGINES.map((f) => (
              <button
                key={f.id}
                onClick={() => build(f.id)}
                className="group inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Puzzle className="h-4 w-4 text-primary" />
                {f.label}
                <span className="hidden text-xs font-normal text-muted-foreground md:inline"> · {f.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {building && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Menganalisis ability, co-occurrence {`>`}4.500 decklist, dan menyusun 60 kartu...
        </div>
      )}

      {result && grouped && (
        <div className="space-y-5">
          {/* Engine analysis */}
          <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                {result.engine_analysis.pattern}
              </span>
              <span className="text-xs text-muted-foreground">{result.engine_analysis.legal_pool}</span>
            </div>
            <h3 className="mb-1 text-base font-bold">{result.deck.name}</h3>
            <p className="text-xs text-muted-foreground">{result.engine_analysis.pattern_label}</p>
            {result.engine_analysis.ability_text && (
              <p className="mt-2 rounded border border-border bg-background/60 p-2 text-xs leading-5">
                {result.engine_analysis.ability_text}
              </p>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <InfoPill icon={Zap} label="Energy" value={result.engine_analysis.energy_plan} />
              <InfoPill icon={Target} label="Synergy" value={`${Math.round(result.deck.synergy_score * 100)}%`} />
              <InfoPill icon={Shield} label="Owned" value={`${result.deck.owned_cards}/${result.deck.total_cards} (${result.deck.completeness_pct}%)`} />
            </div>
          </div>

          {/* Reasoning */}
          <details className="rounded-lg border border-border bg-background/50" open>
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
              <HelpCircle className="h-4 w-4 text-primary" />
              Kenapa deck ini seperti ini? ({result.engine_analysis.reasoning.length} alasan)
            </summary>
            <ul className="space-y-1.5 px-4 pb-4 text-xs text-muted-foreground">
              {result.engine_analysis.reasoning.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {r}
                </li>
              ))}
            </ul>
          </details>

          {/* Decklist */}
          <div className="grid gap-4 lg:grid-cols-3">
            {(['Pokemon', 'Trainer', 'Energy'] as const).map((cat) =>
              grouped[cat]?.length ? (
                <div key={cat} className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {cat} ({grouped[cat].reduce((s, c) => s + c.count, 0)})
                  </p>
                  <div className="space-y-1.5">
                    {grouped[cat].map((c) => (
                      <div key={c.card_id + c.card_name} className="flex items-center gap-2 rounded border border-border/60 bg-background/40 px-2 py-1.5">
                        <span className={`w-7 shrink-0 text-center font-mono text-sm font-bold ${c.is_owned ? 'text-primary' : 'text-muted-foreground'}`}>
                          {c.count}×
                        </span>
                        {cat !== 'Energy' && c.image_url && (
                          <img
                            src={cardImageSrc(c.image_url)}
                            onError={setPlaceholderImage}
                            alt={c.card_name}
                            className="h-9 w-7 rounded-sm object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <a href={`/cards/detail?id=${encodeURIComponent(c.card_id)}`} className="block truncate text-xs font-semibold hover:text-primary">
                            {c.card_name}
                          </a>
                          {c.ability && <span className="block truncate text-[10px] text-muted-foreground">{c.ability}</span>}
                        </div>
                        {!c.is_owned && (
                          <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                            kurang {c.count - c.owned}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {result.deck.description}
          </p>
        </div>
      )}
    </section>
  );
}

function InfoPill({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/60 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3 text-primary" />
        {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}
