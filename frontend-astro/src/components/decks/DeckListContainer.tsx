import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Filter, FlaskConical, Layers3, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trophy, X } from 'lucide-react';
import { useDeckStore } from '../../stores/deckStore';
import DeckList from './DeckList';
import Pagination from '../ui/Pagination';

const FORMAT_OPTIONS = [
  { value: '', label: 'Semua Format' },
  { value: 'Standard', label: 'Standard' },
  { value: 'Expanded', label: 'Expanded' },
  { value: 'GLC', label: 'Gym Leader Challenge' },
];

const SORT_OPTIONS = [
  { value: 'tournaments', label: 'Tournament Count' },
  { value: 'wins', label: 'Win / Top Signal' },
  { value: 'name', label: 'Nama deck' },
  { value: 'price_asc', label: 'Harga rendah' },
  { value: 'price_desc', label: 'Harga tinggi' },
  { value: '', label: 'Default database' },
];

interface DeckListContainerProps {
  limit?: number;
}

export default function DeckListContainer({ limit = 24 }: DeckListContainerProps) {
  const decks = useDeckStore((state) => state.decks);
  const loading = useDeckStore((state) => state.loading);
  const error = useDeckStore((state) => state.error);
  const currentPage = useDeckStore((state) => state.currentPage);
  const totalPages = useDeckStore((state) => state.totalPages);
  const totalCount = useDeckStore((state) => state.totalCount);
  const fetchDecks = useDeckStore((state) => state.fetchDecks);

  const [mounted, setMounted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    format: '',
    sort: 'tournaments',
  });

  const params = useMemo(() => ({
    page: 1,
    limit,
    q: query || undefined,
    format: filters.format || undefined,
    sort: filters.sort || undefined,
  }), [filters, limit, query]);

  const runSearch = useCallback((page = 1) => {
    fetchDecks({ ...params, page });
  }, [fetchDecks, params]);

  useEffect(() => {
    setMounted(true);
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const timer = window.setTimeout(() => runSearch(1), 300);
    return () => window.clearTimeout(timer);
  }, [mounted, runSearch]);

  const handlePageChange = (page: number) => {
    runSearch(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClear = () => {
    setQuery('');
    setFilters({ format: '', sort: 'tournaments' });
  };

  const activeCount = [query, filters.format].filter(Boolean).length;
  const stats = useMemo(() => ({
    standard: decks.filter((deck) => deck.format === 'Standard').length,
    top8: decks.reduce((sum, deck) => sum + (deck.top8_count || 0), 0),
    tournaments: decks.reduce((sum, deck) => sum + (deck.tournament_count || 0), 0),
  }), [decks]);

  if (!mounted) {
    return (
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="min-h-[420px] border border-border bg-card p-5" />
        <DeckList decks={[]} loading />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="mb-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-semibold lg:hidden"
        >
          <Filter className="mr-2 h-4 w-4 text-primary" />
          Filter deck
          {activeCount > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{activeCount}</span>}
        </button>

        <div className={`${filtersOpen ? 'block' : 'hidden'} space-y-4 lg:block`}>
          <section className="border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Deck Filter</p>
                <h2 className="text-lg font-semibold">Meta Control</h2>
              </div>
              <SlidersHorizontal className="h-5 w-5 text-primary" />
            </div>

            <div className="space-y-3">
              <SelectField label="Format" value={filters.format} onChange={(value) => setFilters({ ...filters, format: value })}>
                {FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>

              <SelectField label="Sort" value={filters.sort} onChange={(value) => setFilters({ ...filters, sort: value })}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>
            </div>

            {(activeCount > 0 || filters.sort !== 'tournaments') && (
              <button onClick={handleClear} className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md border border-border bg-background text-sm font-semibold hover:bg-accent">
                <X className="mr-2 h-4 w-4" />
                Reset filter
              </button>
            )}
          </section>

          <section className="border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Result Snapshot</p>
            <div className="mt-3 grid gap-2">
              <FilterStat icon={Layers3} label="Deck tampil" value={decks.length} />
              <FilterStat icon={Trophy} label="Top 8 signal" value={stats.top8} />
              <FilterStat icon={ShieldCheck} label="Tournament" value={stats.tournaments} />
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick Actions</p>
            <div className="mt-3 grid gap-2">
              <a href="/lab/recommendations" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <FlaskConical className="mr-2 h-4 w-4" />
                Rekomendasi inventory
              </a>
              <a href="/decks?tab=builder" className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-accent">
                <Sparkles className="mr-2 h-4 w-4 text-primary" />
                AI Deck Builder
              </a>
            </div>
          </section>
        </div>
      </aside>

      <main className="min-w-0 space-y-4">
        <section className="border border-border bg-card p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari deck, archetype, player, atau tournament..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:w-[360px]">
              <MiniMetric icon={Layers3} label="Total" value={totalCount || decks.length} />
              <MiniMetric icon={Sparkles} label="Page" value={`${currentPage}/${totalPages || 1}`} />
              <MiniMetric icon={Filter} label="Filter" value={activeCount} />
            </div>
          </div>
        </section>

        <div className="text-sm text-muted-foreground">
          Menampilkan <span className="font-semibold text-foreground">{decks.length}</span> deck
          {totalCount > 0 && <span> dari {totalCount} total</span>}
        </div>

        <DeckList
          decks={decks}
          loading={loading}
          error={error}
          emptyTitle="Tidak ada deck ditemukan"
          emptyDescription={loading ? 'Sedang memuat deck...' : 'Coba ubah keyword atau filter di sidebar.'}
        />

        {!loading && !error && decks.length > 0 && (
          <Pagination currentPage={currentPage} totalPages={totalPages} totalCount={totalCount} pageSize={limit} onPageChange={handlePageChange} />
        )}
      </main>
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}

function FilterStat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border border-border bg-background px-3 py-2">
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </span>
      <span className="rounded bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground">{value}</span>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="border border-border bg-background px-3 py-2">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-bold">{value}</p>
    </div>
  );
}
