import { useEffect, useState } from 'react';
import { useCollectionStore } from '@stores/index';
import { BarChart3, ChevronLeft, FlaskConical, ImageIcon, List, Loader2, Package, Plus, Sparkles } from 'lucide-react';
import PortfolioDashboard from './PortfolioDashboard';
import { cardImageSrc, setPlaceholderImage } from '@utils/images';
import { formatIDR } from '@utils/formatters';

const sampleInventory = [
  { card_id: '71108', quantity: 3 },
  { card_id: '70786', quantity: 2 },
  { card_id: '70804', quantity: 2 },
  { card_id: '70788', quantity: 2 },
  { card_id: '71102', quantity: 1 },
  { card_id: '69486', quantity: 1 },
  { card_id: '71141', quantity: 1 },
  { card_id: '69515', quantity: 1 },
  { card_id: '71059', quantity: 1 },
  { card_id: '70892', quantity: 1 },
];

export default function CollectionDetailView({ collectionId }: { collectionId: string }) {
  const { currentCollection, fetchCollection, addToCollection, loading, error } = useCollectionStore();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'items'>('dashboard');
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetchCollection(collectionId);
  }, [collectionId, fetchCollection]);

  const items = currentCollection?.items || [];
  const totalCards = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPurchase = items.reduce((sum, item) => sum + (item.purchase_price || 0) * item.quantity, 0);

  const handleSeed = async () => {
    setSeeding(true);
    for (const item of sampleInventory) {
      await addToCollection(collectionId, { ...item, condition: 'NM' });
    }
    await fetchCollection(collectionId);
    setSeeding(false);
    setActiveTab('items');
  };

  if (loading && !currentCollection) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!currentCollection) {
    return (
      <div className="border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        {error || 'Collection tidak ditemukan atau bukan milik akun yang sedang login.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <a href="/collections" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mb-2">
            <ChevronLeft className="h-4 w-4" /> Kembali ke Daftar Koleksi
          </a>
          <h1 className="text-3xl font-black flex items-center gap-3">
            {currentCollection.name}
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">
              Personal Collection
            </span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {totalCards} total cards dari {items.length} kartu unik. Data ini dipakai sebagai inventory source PokeLab.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {items.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="inline-flex h-10 items-center rounded-md border border-green-500/30 bg-green-500/10 px-4 text-sm font-semibold text-green-400 hover:bg-green-500/15 disabled:opacity-60"
            >
              {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Isi sample meta
            </button>
          )}
          <a
            href={`/lab/recommendations?collection_id=${collectionId}`}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            Analisis deck
          </a>
          <div className="flex bg-muted p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                activeTab === 'dashboard' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-4 w-4" /> Insight
            </button>
            <button
              onClick={() => setActiveTab('items')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                activeTab === 'items' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="h-4 w-4" /> Kartu Saya
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile label="Total Cards" value={`${totalCards}`} detail={`${items.length} unique cards`} />
        <StatTile label="Purchase Value" value={formatIDR(totalPurchase)} detail="manual purchase price" />
        <StatTile label="Lab Status" value={totalCards > 0 ? 'Ready' : 'Empty'} detail="inventory scoring source" />
      </div>

      {error && (
        <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="pt-4">
        {activeTab === 'dashboard' ? (
          <PortfolioDashboard collectionId={collectionId} />
        ) : (
          <CollectionItems items={items} onSeed={handleSeed} seeding={seeding} />
        )}
      </div>
    </div>
  );
}

function CollectionItems({ items, onSeed, seeding }: { items: any[]; onSeed: () => void; seeding: boolean }) {
  if (items.length === 0) {
    return (
      <div className="border border-dashed border-border bg-card p-10 text-center">
        <Package className="mx-auto h-10 w-10 text-primary" />
        <h3 className="mt-4 text-lg font-semibold">Collection masih kosong</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Isi sample meta untuk mencoba PokeLab, atau buka detail kartu lalu tekan Tambah ke Koleksi.
        </p>
        <button onClick={onSeed} disabled={seeding} className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Isi sample meta
        </button>
      </div>
    );
  }

  return (
    <section className="border border-border bg-card p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Daftar Kartu</h2>
        <p className="mt-1 text-sm text-muted-foreground">Klik kartu untuk membuka detail dan melihat kebutuhan di deck meta.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const card = item.card;
          return (
            <a key={item.id} href={`/cards/detail?id=${encodeURIComponent(item.card_id)}`} className="grid grid-cols-[64px_1fr] gap-3 border border-border bg-background p-3 transition-colors hover:border-primary/50">
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                {card ? (
                  <img src={cardImageSrc(card)} alt={card.name_id || item.card_id} className="h-full w-full object-cover" onError={setPlaceholderImage} />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-semibold">{card?.name_id || item.card_id}</h3>
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">{item.quantity}x</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{card?.category || '-'}{card?.card_type ? ` / ${card.card_type}` : ''}</p>
                <p className="mt-2 text-xs text-muted-foreground">{card?.expansion_code || 'Unknown set'} {card?.rarity ? `- ${card.rarity}` : ''}</p>
                <p className="mt-2 text-xs text-muted-foreground">Condition: <span className="font-medium text-foreground">{item.condition || 'NM'}</span></p>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

// Render helper for Astro
export function renderCollectionDetail(container: HTMLElement, collectionId: string) {
  import('react-dom/client').then(({ createRoot }) => {
    const root = createRoot(container);
    root.render(<CollectionDetailView collectionId={collectionId} />);
  });
}
