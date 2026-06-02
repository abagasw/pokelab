import { useState, useEffect } from 'react';
import { useDeckStore, useCollectionStore, useAuthStore } from '@stores/index';
import { Sparkles, Loader2, Coins, Target, Package, Lock } from 'lucide-react';
import { formatIDR, formatUSD, getTypeColor } from '@utils/formatters';
import type { DeckBuildRequest, DeckBuildResponse } from '../../types';

const POKEMON_TYPES = [
  'Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 
  'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon'
];

const REGULATION_MARKS = ['G', 'H', 'I', 'J'];

export default function DeckBuilder() {
  const { currentDeck, buildingDeck, error, buildDeck, clearCurrentDeck } = useDeckStore();
  const { collections, fetchCollections } = useCollectionStore();
  const { user } = useAuthStore();
  
  const [formData, setFormData] = useState<DeckBuildRequest>({
    name: '',
    budget: undefined,
    budget_currency: 'IDR',
    preferred_types: [],
    regulation_marks: [],
    use_inventory: false,
    collection_id: '',
  });

  useEffect(() => {
    if (user) {
      fetchCollections();
    }
  }, [user, fetchCollections]);

  useEffect(() => {
    // Set default collection if inventory is enabled and collections exist
    if (formData.use_inventory && collections.length > 0 && !formData.collection_id) {
      setFormData(prev => ({ ...prev, collection_id: collections[0].id }));
    }
  }, [formData.use_inventory, collections]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await buildDeck(formData);
  };

  const toggleRegulationMark = (mark: string) => {
    const current = formData.regulation_marks || [];
    if (current.includes(mark)) {
      setFormData({
        ...formData,
        regulation_marks: current.filter(m => m !== mark)
      });
    } else {
      setFormData({
        ...formData,
        regulation_marks: [...current, mark]
      });
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {/* Build Form */}
      <div className="lg:col-span-1">
        <div className="sticky top-24 rounded-lg border bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Sparkles className="mr-2 h-5 w-5 text-purple-500" />
            Konfigurasi Deck
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Deck Name */}
            <div>
              <label className="text-sm font-medium">Nama Deck</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Contoh: Budget Deck"
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Inventory Toggle */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-blue-500" />
                  Gunakan Koleksi Saya
                </label>
                {user ? (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, use_inventory: !formData.use_inventory })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.use_inventory ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.use_inventory ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                ) : (
                  <div className="text-[10px] bg-muted px-2 py-0.5 rounded flex items-center gap-1 text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    Login Required
                  </div>
                )}
              </div>
              
              {formData.use_inventory && user && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <select
                    value={formData.collection_id}
                    onChange={(e) => setFormData({ ...formData, collection_id: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {collections.length > 0 ? (
                      collections.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))
                    ) : (
                      <option disabled>Tidak ada koleksi</option>
                    )}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    AI hanya akan menyarankan kartu yang kamu miliki dalam koleksi ini.
                  </p>
                </div>
              )}
            </div>

            {/* Budget */}
            <div className={formData.use_inventory ? 'opacity-50 pointer-events-none' : ''}>
              <label className="text-sm font-medium flex items-center">
                <Coins className="mr-1 h-4 w-4" />
                Budget (IDR)
              </label>
              <input
                type="number"
                value={formData.budget || ''}
                onChange={(e) => setFormData({ ...formData, budget: parseInt(e.target.value) || undefined })}
                placeholder="500000"
                min={0}
                step={10000}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.use_inventory 
                  ? 'Budget diabaikan saat membangun dari koleksi' 
                  : 'Biarkan kosong untuk unlimited budget'}
              </p>
            </div>

            {/* Preferred Type */}
            <div>
              <label className="text-sm font-medium flex items-center">
                <Target className="mr-1 h-4 w-4" />
                Tipe Pokemon Favorit
              </label>
              <select
                value={formData.preferred_types?.[0] || ''}
                onChange={(e) => setFormData({ ...formData, preferred_types: e.target.value ? [e.target.value] : [] })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Semua Tipe</option>
                {POKEMON_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Regulation Marks */}
            <div>
              <label className="text-sm font-medium">Regulation Mark</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {REGULATION_MARKS.map((mark) => (
                  <button
                    key={mark}
                    type="button"
                    onClick={() => toggleRegulationMark(mark)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      formData.regulation_marks?.includes(mark)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {mark}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pilih untuk filter kartu legal
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={buildingDeck || !formData.name}
              className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {buildingDeck ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Building with AI...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Build Deck
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Results */}
      <div className="lg:col-span-2">
        {currentDeck ? (
          <DeckResult deck={currentDeck} onClear={clearCurrentDeck} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-purple-500" />
            </div>
            <h3 className="text-lg font-semibold">AI Deck Builder</h3>
            <p className="text-muted-foreground max-w-md mt-2">
              Masukkan konfigurasi deck di sebelah kiri dan AI akan membangun deck 
              kompetitif berdasarkan budget dan preferensi kamu.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DeckResult({ deck, onClear }: { deck: DeckBuildResponse; onClear: () => void }) {
  const { saveDeck, loading } = useDeckStore();
  const { user } = useAuthStore();
  const [saved, setSaved] = useState(false);

  // Type guard to check if cards is array or categorized object
  const isCategorizedCards = (cards: DeckBuildResponse['cards']): cards is { pokemon: any[]; trainer: any[]; energy: any[] } => {
    return cards !== null && typeof cards === 'object' && !Array.isArray(cards) && 'pokemon' in cards;
  };
  
  const categorizedCards = isCategorizedCards(deck.cards) ? deck.cards : null;

  const handleSave = async () => {
    if (!user) return;
    if (!categorizedCards) return;
    
    // Prepare deck data for saving
    const allCards = [
      ...categorizedCards.pokemon.map((c: any) => ({ ...c, is_pokemon: true })),
      ...categorizedCards.trainer.map((c: any) => ({ ...c, is_pokemon: false })),
      ...categorizedCards.energy.map((c: any) => ({ ...c, is_pokemon: false }))
    ];

    const success = await saveDeck({
      name: deck.name,
      archetype: deck.archetype,
      description: deck.description,
      format: 'Standard',
      decklists: [{ cards: allCards }]
    });

    if (success) {
      setSaved(true);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-bold">{deck.name}</h2>
            {deck.total_cards === 60 && (
              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-green-200">
                60 CARDS
              </span>
            )}
            {/* Show inventory badge if applicable */}
            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-200">
              {deck.total_cards > 0 ? 'KOLEKSI PRIBADI' : 'REKOMENDASI AI'}
            </span>
          </div>
          {deck.archetype && (
            <p className="text-muted-foreground">{deck.archetype}</p>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {user ? (
            <button
              onClick={handleSave}
              disabled={loading || saved}
              className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-all ${
                saved 
                  ? 'bg-green-500/10 text-green-500 border border-green-500/20 cursor-default' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : saved ? (
                '✓ Tersimpan'
              ) : (
                'Simpan ke My Decks'
              )}
            </button>
          ) : (
            <div className="group relative">
              <button
                disabled
                className="inline-flex items-center justify-center rounded-md bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground cursor-not-allowed border"
              >
                Simpan ke My Decks
              </button>
              <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-popover text-popover-foreground text-[10px] rounded border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Silakan login untuk menyimpan deck buatanmu.
              </div>
            </div>
          )}
          <button
            onClick={onClear}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Build Baru
          </button>
        </div>
      </div>

      {/* Pricing Info */}
      {deck.pricing && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total Harga (IDR)</p>
              <p className="text-xl font-bold text-green-600">
                {formatIDR(deck.pricing.total_idr)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Harga (USD)</p>
              <p className="text-xl font-bold text-blue-600">
                {formatUSD(deck.pricing.total_usd)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status Budget</p>
              <p className={`text-xl font-bold ${deck.pricing.within_budget ? 'text-green-600' : 'text-red-600'}`}>
                {deck.pricing.within_budget ? '✓ Sesuai' : '✗ Over'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cards Breakdown */}
      {categorizedCards && (
        <div className="space-y-4">
          {/* Pokemon */}
          {categorizedCards.pokemon.length > 0 && (
            <CardSection title="Pokemon" cards={categorizedCards.pokemon} color="red" />
          )}
          
          {/* Trainer */}
          {categorizedCards.trainer.length > 0 && (
            <CardSection title="Trainer" cards={categorizedCards.trainer} color="blue" />
          )}
          
          {/* Energy */}
          {categorizedCards.energy.length > 0 && (
            <CardSection title="Energy" cards={categorizedCards.energy} color="yellow" />
          )}
        </div>
      )}

      {/* Analysis */}
      {deck.analysis && (
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-3">Analisis Deck</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {deck.analysis.strengths && (
              <div>
                <p className="text-sm font-medium text-green-600">Kekuatan</p>
                <ul className="mt-1 text-sm text-muted-foreground">
                  {deck.analysis.strengths.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {deck.analysis.weaknesses && (
              <div>
                <p className="text-sm font-medium text-red-600">Kelemahan</p>
                <ul className="mt-1 text-sm text-muted-foreground">
                  {deck.analysis.weaknesses.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardSection({ 
  title, 
  cards, 
  color 
}: { 
  title: string; 
  cards: { card_id: string; card_name: string; count: number; price_idr?: number }[];
  color: 'red' | 'blue' | 'yellow';
}) {
  const colorClasses = {
    red: 'bg-red-50 border-red-200',
    blue: 'bg-blue-50 border-blue-200',
    yellow: 'bg-yellow-50 border-yellow-200',
  };

  const totalCards = cards.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <h3 className="font-semibold mb-3 flex items-center justify-between">
        {title}
        <span className="text-sm font-normal text-muted-foreground">
          {totalCards} cards
        </span>
      </h3>
      <div className="space-y-2">
        {cards.map((card, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between py-2 px-3 rounded-md bg-white/50"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{card.count}x</span>
              <span className="text-sm">{card.card_name}</span>
            </div>
            {card.price_idr && (
              <span className="text-sm text-muted-foreground">
                {formatIDR(card.price_idr * card.count)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
