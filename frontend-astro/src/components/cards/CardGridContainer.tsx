import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Filter, Layers3, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useCardStore } from '../../stores/cardStore';
import CardGrid from './CardGrid';
import Pagination from '../ui/Pagination';
import { api } from '../../api/client';
import type { Expansion } from '../../types';

interface CardGridContainerProps {
  limit?: number;
}

const RARITY_OPTIONS = [
  { value: '', label: 'Semua Rarity' },
  { value: 'C', label: 'Common' },
  { value: 'U', label: 'Uncommon' },
  { value: 'R', label: 'Rare' },
  { value: 'RR', label: 'Double Rare' },
  { value: 'SR', label: 'Super Rare' },
  { value: 'SAR', label: 'Special Art Rare' },
  { value: 'UR', label: 'Ultra Rare' },
  { value: 'Common', label: 'Common (EN)' },
  { value: 'Rare', label: 'Rare (EN)' },
  { value: 'Ultra Rare', label: 'Ultra Rare (EN)' },
];

const TYPE_OPTIONS = [
  '', 'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless',
].map((value) => ({ value, label: value || 'Semua Tipe' }));

const CATEGORY_OPTIONS = [
  { value: '', label: 'Semua Kategori' },
  { value: 'Pokemon', label: 'Pokemon' },
  { value: 'Trainer', label: 'Trainer' },
  { value: 'Energy', label: 'Energy' },
];

const SORT_OPTIONS = [
  { value: 'expansion', label: 'Expansion terbaru' },
  { value: 'name_asc', label: 'Nama A-Z' },
  { value: 'name_desc', label: 'Nama Z-A' },
  { value: 'rarity', label: 'Rarity' },
  { value: '', label: 'Default database' },
];

export default function CardGridContainer({ limit = 24 }: CardGridContainerProps) {
  const cards = useCardStore((state) => state.cards);
  const loading = useCardStore((state) => state.loading);
  const error = useCardStore((state) => state.error);
  const currentPage = useCardStore((state) => state.currentPage);
  const totalPages = useCardStore((state) => state.totalPages);
  const totalCount = useCardStore((state) => state.totalCount);
  const searchCards = useCardStore((state) => state.searchCards);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expansions, setExpansions] = useState<Expansion[]>([]);
  const [filters, setFilters] = useState({
    expansion: '',
    category: '',
    type: '',
    rarity: '',
    sort: 'expansion',
  });

  const params = useMemo(() => ({
    query,
    expansion: filters.expansion || undefined,
    category: filters.category || undefined,
    type: filters.type || undefined,
    rarity: filters.rarity || undefined,
    sort: filters.sort || undefined,
    limit,
  }), [filters, limit, query]);

  const runSearch = useCallback((page = 1) => {
    searchCards({ ...params, page });
  }, [params, searchCards]);

  useEffect(() => {
    setMounted(true);
    runSearch(1);
    api.getExpansions().then((response) => {
      if (response.success && response.data) {
        setExpansions(response.data);
      }
    });
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
    setFilters({ expansion: '', category: '', type: '', rarity: '', sort: 'expansion' });
  };

  const activeCount = [query, filters.expansion, filters.category, filters.type, filters.rarity].filter(Boolean).length;
  const categoryCounts = useMemo(() => ({
    Pokemon: cards.filter((card) => card.category === 'Pokemon').length,
    Trainer: cards.filter((card) => card.category === 'Trainer').length,
    Energy: cards.filter((card) => card.category === 'Energy').length,
  }), [cards]);

  if (!mounted) {
    return (
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="min-h-[420px] border border-border bg-card p-5" />
        <CardGrid cards={[]} loading emptyTitle="Tidak ada kartu" emptyDescription="Belum ada kartu yang ditemukan" />
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
          Filter kartu
          {activeCount > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{activeCount}</span>}
        </button>

        <div className={`${filtersOpen ? 'block' : 'hidden'} space-y-4 lg:block`}>
          <section className="border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Card Filter</p>
                <h2 className="text-lg font-semibold">Library Control</h2>
              </div>
              <SlidersHorizontal className="h-5 w-5 text-primary" />
            </div>

            <div className="space-y-3">
              <SelectField label="Expansion" value={filters.expansion} onChange={(value) => setFilters({ ...filters, expansion: value })}>
                <option value="">Semua Expansion</option>
                {expansions
                  .slice()
                  .sort((a, b) => (b.released_at || '').localeCompare(a.released_at || ''))
                  .map((expansion) => (
                    <option key={expansion.code} value={expansion.code}>
                      {expansion.code}{expansion.name_id ? ` - ${expansion.name_id}` : ''}
                    </option>
                  ))}
              </SelectField>

              <SelectField label="Kategori" value={filters.category} onChange={(value) => setFilters({ ...filters, category: value })}>
                {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>

              <SelectField label="Tipe" value={filters.type} onChange={(value) => setFilters({ ...filters, type: value })}>
                {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>

              <SelectField label="Rarity" value={filters.rarity} onChange={(value) => setFilters({ ...filters, rarity: value })}>
                {RARITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>

              <SelectField label="Sort" value={filters.sort} onChange={(value) => setFilters({ ...filters, sort: value })}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>
            </div>

            {(activeCount > 0 || filters.sort !== 'expansion') && (
              <button onClick={handleClear} className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md border border-border bg-background text-sm font-semibold hover:bg-accent">
                <X className="mr-2 h-4 w-4" />
                Reset filter
              </button>
            )}
          </section>

          <section className="border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Result</p>
            <div className="mt-3 grid gap-2">
              <FilterStat label="Pokemon" value={categoryCounts.Pokemon} tone="green" />
              <FilterStat label="Trainer" value={categoryCounts.Trainer} tone="blue" />
              <FilterStat label="Energy" value={categoryCounts.Energy} tone="amber" />
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
                placeholder="Cari nama kartu, collector no, atau expansion..."
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
              <MiniMetric icon={Layers3} label="Total" value={totalCount || cards.length} />
              <MiniMetric icon={Sparkles} label="Page" value={`${currentPage}/${totalPages || 1}`} />
              <MiniMetric icon={Filter} label="Filter" value={activeCount} />
            </div>
          </div>
        </section>

        <CardGrid
          cards={cards}
          loading={loading}
          error={error}
          emptyTitle="Tidak ada kartu"
          emptyDescription={loading ? 'Sedang memuat kartu...' : 'Coba ubah kata kunci pencarian atau filter di sidebar.'}
        />

        {!loading && !error && cards.length > 0 && (
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

function FilterStat({ label, value, tone }: { label: string; value: number; tone: 'green' | 'blue' | 'amber' }) {
  const toneClass = tone === 'green' ? 'bg-green-500 text-background' : tone === 'amber' ? 'bg-yellow-500 text-background' : 'bg-primary text-primary-foreground';
  return (
    <div className="flex items-center justify-between border border-border bg-background px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${toneClass}`}>{value}</span>
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
