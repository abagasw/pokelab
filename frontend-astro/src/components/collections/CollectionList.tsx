import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Layers3, Loader2, Package, Plus, Search, Sparkles, Trash2, Wallet, X } from 'lucide-react';
import { useCollectionStore } from '@stores/collectionStore';
import { useAuthStore } from '@stores/authStore';
import { formatIDR } from '@utils/formatters';

const starterInventory = [
  { card_id: '71108', quantity: 3, label: 'Munkidori' },
  { card_id: '70786', quantity: 2, label: 'Mega Absol ex' },
  { card_id: '70804', quantity: 2, label: 'Mega Kangaskhan ex' },
  { card_id: '70788', quantity: 2, label: 'Yveltal' },
  { card_id: '71102', quantity: 1, label: 'Latias ex' },
  { card_id: '69486', quantity: 1, label: 'Pecharunt ex' },
  { card_id: '71141', quantity: 1, label: 'Fezandipiti ex' },
  { card_id: '69515', quantity: 1, label: 'Ursaluna Bulan Merah ex' },
  { card_id: '71059', quantity: 1, label: 'Psyduck' },
  { card_id: '70892', quantity: 1, label: 'Genesect' },
];

export default function CollectionList() {
  const { collections, fetchCollections, createCollection, deleteCollection, addToCollection, loading, error } = useCollectionStore();
  const { authReady, isAuthenticated } = useAuthStore();
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [seedingId, setSeedingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addCardCollectionId, setAddCardCollectionId] = useState<string | null>(null);
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<any[]>([]);
  const [cardSearching, setCardSearching] = useState(false);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);

  useEffect(() => {
    if (authReady && isAuthenticated) {
      fetchCollections();
    }
  }, [authReady, isAuthenticated, fetchCollections]);

  const totals = useMemo(() => {
    const cardCount = collections.reduce((sum, collection) => sum + (collection.total_cards || 0), 0);
    const value = collections.reduce((sum, collection) => sum + (collection.total_value_idr || 0), 0);
    const readyCollections = collections.filter((collection) => (collection.total_cards || 0) > 0).length;
    return { cardCount, value, readyCollections };
  }, [collections]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCollectionName.trim()) return;

    const success = await createCollection(newCollectionName);
    if (success) {
      setNewCollectionName('');
      setShowCreateForm(false);
      await fetchCollections();
    }
  };

  const handleSeed = async (collectionId: string) => {
    setSeedingId(collectionId);
    for (const item of starterInventory) {
      await addToCollection(collectionId, { card_id: item.card_id, quantity: item.quantity, condition: 'NM' });
    }
    await fetchCollections();
    setSeedingId(null);
  };

  const handleDelete = async (collectionId: string) => {
    setDeletingId(collectionId);
    const success = await deleteCollection(collectionId);
    if (success) {
      setConfirmDeleteId(null);
      await fetchCollections();
    }
    setDeletingId(null);
  };

  const handleSearchCards = async (query: string) => {
    setCardSearchQuery(query);
    if (query.length < 2) {
      setCardSearchResults([]);
      return;
    }
    setCardSearching(true);
    try {
      const { api } = await import('@api/client');
      const response = await api.searchCards({ q: query, limit: 8 });
      if (response.success && response.data?.cards) {
        setCardSearchResults(response.data.cards);
      } else {
        setCardSearchResults([]);
      }
    } catch {
      setCardSearchResults([]);
    } finally {
      setCardSearching(false);
    }
  };

  const handleAddCard = async (cardId: string) => {
    if (!addCardCollectionId) return;
    setAddingCardId(cardId);
    try {
      await addToCollection(addCardCollectionId, { card_id: cardId, quantity: 1, condition: 'NM' });
      await fetchCollections();
      setCardSearchQuery('');
      setCardSearchResults([]);
    } finally {
      setAddingCardId(null);
    }
  };

  if (!authReady) {
    return (
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
          Menyiapkan sesi akun
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto max-w-2xl px-4 py-12 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Login untuk melihat inventory</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Collection dipakai PokeLab untuk menghitung deck readiness, missing cards, dan buy priority.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <a href="/login?redirect=/collections" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Login
            </a>
            <a href="/register?redirect=/collections" className="inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-sm font-semibold text-foreground hover:bg-accent">
              Daftar
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric icon={Layers3} label="Collections" value={`${collections.length}`} detail={`${totals.readyCollections} berisi kartu`} />
        <Metric icon={Package} label="Total Cards" value={`${totals.cardCount}`} detail="quantity di semua collection" />
        <Metric icon={Wallet} label="Estimated Value" value={formatIDR(totals.value)} detail="berdasarkan harga IDR tersimpan" />
      </div>

      <section className="border border-border bg-card p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Collection Workspace</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Pilih collection sebagai sumber inventory PokeLab atau isi sample inventory untuk langsung mencoba deck analysis.
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Koleksi Baru
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreate} className="mb-5 grid gap-3 rounded-md border border-border bg-background p-4 md:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              placeholder="Nama koleksi"
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              autoFocus
            />
            <button type="submit" disabled={loading} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {loading ? 'Membuat...' : 'Buat'}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-accent">
              Batal
            </button>
          </form>
        )}

        {error && <div className="mb-5 border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        {loading && collections.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center border border-dashed border-border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Memuat collection
          </div>
        ) : collections.length === 0 ? (
          <EmptyCollections onCreate={() => setShowCreateForm(true)} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {collections.map((collection) => {
              const isEmpty = (collection.total_cards || 0) === 0;
              return (
                <article key={collection.id} className="border border-border bg-background p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-semibold">{collection.name}</h3>
                        {isEmpty ? <Badge tone="amber">Kosong</Badge> : <Badge tone="green">Ready</Badge>}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {isEmpty
                          ? 'Belum ada kartu. Isi sample inventory atau tambah kartu dari halaman detail kartu.'
                          : `${collection.total_cards} kartu siap dipakai untuk scoring rekomendasi deck.`}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:w-48">
                      <MiniStat label="Cards" value={`${collection.total_cards || 0}`} />
                      <MiniStat label="Value" value={formatIDR(collection.total_value_idr || 0)} />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                    <a href={`/collections/detail?id=${collection.id}`} className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-primary hover:bg-accent">
                      <Package className="mr-2 h-4 w-4" />
                      Buka collection
                    </a>
                    <a href={`/lab/recommendations?collection_id=${collection.id}`} className="inline-flex h-9 items-center rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-semibold text-primary hover:bg-primary/15">
                      <FlaskConical className="mr-2 h-4 w-4" />
                      Analisis deck
                    </a>
                    <button
                      onClick={() => { setAddCardCollectionId(collection.id); setCardSearchQuery(''); setCardSearchResults([]); }}
                      className="inline-flex h-9 items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-3 text-sm font-semibold text-blue-400 hover:bg-blue-500/15"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Tambah Kartu
                    </button>
                    {isEmpty && (
                      <button
                        onClick={() => handleSeed(collection.id)}
                        disabled={seedingId === collection.id}
                        className="inline-flex h-9 items-center rounded-md border border-green-500/30 bg-green-500/10 px-3 text-sm font-semibold text-green-400 hover:bg-green-500/15 disabled:opacity-60"
                      >
                        {seedingId === collection.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Isi sample meta
                      </button>
                    )}
                    {confirmDeleteId === collection.id ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="text-xs text-destructive font-medium">Hapus?</span>
                        <button
                          onClick={() => handleDelete(collection.id)}
                          disabled={deletingId === collection.id}
                          className="inline-flex h-9 items-center rounded-md bg-destructive px-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
                        >
                          {deletingId === collection.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
                          Ya, Hapus
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground hover:bg-accent"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(collection.id)}
                        className="inline-flex h-9 items-center rounded-md border border-destructive/30 bg-destructive/10 px-3 text-sm font-semibold text-destructive hover:bg-destructive/15"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Hapus
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Add Card Search Modal */}
      {addCardCollectionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAddCardCollectionId(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Tambah Kartu ke Koleksi</h3>
              <button onClick={() => setAddCardCollectionId(null)} className="p-1 rounded-md hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={cardSearchQuery}
                onChange={(e) => handleSearchCards(e.target.value)}
                placeholder="Cari nama kartu (contoh: Pikachu, Charizard)..."
                className="h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm"
                autoFocus
              />
            </div>
            {cardSearching && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mencari kartu...
              </div>
            )}
            {!cardSearching && cardSearchQuery.length >= 2 && cardSearchResults.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Kartu tidak ditemukan. Coba kata kunci lain.
              </div>
            )}
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {cardSearchResults.map((card) => (
                <div key={card.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                  <div className="h-12 w-9 flex-shrink-0 overflow-hidden rounded border border-border bg-muted">
                    {card.image_url ? (
                      <img src={card.image_url} alt={card.name_id} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs">🃏</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{card.name_id}</p>
                    <p className="text-xs text-muted-foreground">{card.expansion_code} {card.rarity ? `- ${card.rarity}` : ''} {card.collector_number ? `#${card.collector_number}` : ''}</p>
                  </div>
                  <button
                    onClick={() => handleAddCard(card.id)}
                    disabled={addingCardId === card.id}
                    className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {addingCardId === card.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyCollections({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border border-dashed border-border bg-background px-4 py-10 text-center">
      <Package className="mx-auto h-10 w-10 text-primary" />
      <h3 className="mt-4 text-lg font-semibold">Belum ada collection</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Buat collection pertama, lalu tambah kartu dari detail kartu atau isi sample meta untuk mencoba PokeLab.
      </p>
      <button onClick={onCreate} className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        <Plus className="mr-2 h-4 w-4" />
        Buat collection
      </button>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: any; label: string; value: string; detail: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' }) {
  const toneClass = {
    slate: 'border-border bg-secondary/50 text-muted-foreground',
    green: 'border-green-500/25 bg-green-500/10 text-green-500',
    amber: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-500',
  }[tone];
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}
