import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, X, ChevronDown } from 'lucide-react';
import { useCardStore } from '../../stores/cardStore';
import Button from '../ui/Button';
import { api } from '../../api/client';
import type { Expansion } from '../../types';

const RARITY_OPTIONS = [
  { value: '', label: 'Semua Rarity' },
  { value: 'Common', label: 'Common' },
  { value: 'Uncommon', label: 'Uncommon' },
  { value: 'Rare', label: 'Rare' },
  { value: 'Double Rare', label: 'Double Rare' },
  { value: 'Ultra Rare', label: 'Ultra Rare' },
  { value: 'Secret Rare', label: 'Secret Rare' },
  { value: 'Illustration Rare', label: 'Illustration Rare' },
  { value: 'Special Illustration Rare', label: 'Special Illustration Rare' },
  { value: 'Hyper Rare', label: 'Hyper Rare' },
  { value: 'Crown Rare', label: 'Crown Rare' },
  { value: 'Shiny Rare', label: 'Shiny Rare' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'Semua Tipe' },
  { value: 'Grass', label: 'Grass' },
  { value: 'Fire', label: 'Fire' },
  { value: 'Water', label: 'Water' },
  { value: 'Lightning', label: 'Lightning' },
  { value: 'Psychic', label: 'Psychic' },
  { value: 'Fighting', label: 'Fighting' },
  { value: 'Darkness', label: 'Darkness' },
  { value: 'Metal', label: 'Metal' },
  { value: 'Dragon', label: 'Dragon' },
  { value: 'Colorless', label: 'Colorless' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'Semua Kategori' },
  { value: 'Pokemon', label: 'Pokemon' },
  { value: 'Trainer', label: 'Trainer' },
  { value: 'Energy', label: 'Energy' },
];

const SORT_OPTIONS = [
  { value: '', label: 'Urutkan' },
  { value: 'name_asc', label: 'Nama (A-Z)' },
  { value: 'name_desc', label: 'Nama (Z-A)' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'rarity', label: 'Rarity' },
];

export default function CardSearch() {
  const { searchCards, loading, totalCount } = useCardStore();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expansions, setExpansions] = useState<Expansion[]>([]);
  const [loadingExpansions, setLoadingExpansions] = useState(false);
  const [filters, setFilters] = useState({
    expansion: '',
    rarity: '',
    type: '',
    category: '',
    sort: '',
  });

  // Fetch expansions on mount
  useEffect(() => {
    const fetchExpansions = async () => {
      setLoadingExpansions(true);
      try {
        const response = await api.getExpansions();
        if (response.success && response.data) {
          setExpansions(response.data);
        }
      } catch (err) {
        console.error('Failed to fetch expansions:', err);
      } finally {
        setLoadingExpansions(false);
      }
    };
    fetchExpansions();
  }, []);

  // Debounced search
  const debouncedSearch = useCallback(
    (searchQuery: string, searchFilters: typeof filters) => {
      searchCards({
        query: searchQuery,
        expansion: searchFilters.expansion || undefined,
        rarity: searchFilters.rarity || undefined,
        type: searchFilters.type || undefined,
        category: searchFilters.category || undefined,
        sort: searchFilters.sort || undefined,
        limit: 24,
      });
    },
    [searchCards]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      debouncedSearch(query, filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, filters, debouncedSearch]);

  const handleClear = () => {
    setQuery('');
    setFilters({ expansion: '', rarity: '', type: '', category: '', sort: '' });
  };

  const hasActiveFilters = query || filters.expansion || filters.rarity || filters.type || filters.category || filters.sort;

  const activeFilterCount = [
    filters.expansion,
    filters.rarity,
    filters.type,
    filters.category,
    filters.sort,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari kartu..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
            className="h-10 pl-3 pr-10 rounded-md border bg-background text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground" />
        </div>

        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className={showFilters ? 'bg-accent' : ''}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" onClick={handleClear}>
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
        )}
      </div>

      {/* Result Count */}
      {totalCount > 0 && (
        <div className="text-sm text-muted-foreground">
          Ditemukan <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> kartu
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Expansion</label>
            <select
              value={filters.expansion}
              onChange={(e) => setFilters({ ...filters, expansion: e.target.value })}
              className="w-full h-10 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={loadingExpansions}
            >
              <option value="">Semua Expansion</option>
              {expansions
                .slice()
                .sort((a, b) => (b.released_at || '').localeCompare(a.released_at || ''))
                .map((exp) => (
                  <option key={exp.code} value={exp.code}>
                    {exp.code} {exp.name_id ? `- ${exp.name_id}` : ''}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Kategori</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="w-full h-10 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Tipe</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full h-10 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Rarity</label>
            <select
              value={filters.rarity}
              onChange={(e) => setFilters({ ...filters, rarity: e.target.value })}
              className="w-full h-10 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {RARITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Active Filters Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {query && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
              Search: {query}
              <button
                onClick={() => setQuery('')}
                className="ml-1 hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.expansion && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {filters.expansion}
              <button
                onClick={() => setFilters({ ...filters, expansion: '' })}
                className="ml-1 hover:text-blue-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.category && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {filters.category}
              <button
                onClick={() => setFilters({ ...filters, category: '' })}
                className="ml-1 hover:text-green-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.type && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              {filters.type}
              <button
                onClick={() => setFilters({ ...filters, type: '' })}
                className="ml-1 hover:text-purple-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.rarity && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              {filters.rarity}
              <button
                onClick={() => setFilters({ ...filters, rarity: '' })}
                className="ml-1 hover:text-yellow-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
