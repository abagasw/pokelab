import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore, useCollectionStore } from '@stores/index';
import { BarChart3, ChevronLeft, FileText, FlaskConical, ImageIcon, List, Loader2, Package, Plus, Search, Sparkles, Upload, X } from 'lucide-react';
import PortfolioDashboard from './PortfolioDashboard';
import { cardImageSrc, setPlaceholderImage } from '@utils/images';
import { formatIDR } from '@utils/formatters';
import { api } from '@api/client';

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

/* ── File parser: extracts { name, quantity } from .md / .txt inventory lists ── */
interface ParsedEntry { name: string; quantity: number; raw: string; }

function parseInventoryText(text: string): ParsedEntry[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const entries: ParsedEntry[] = [];

  for (const line of lines) {
    // Skip markdown headers, separators, empty-ish lines
    if (/^(#{1,6}\s|---|\*\*\*|___|\|.*\|)/.test(line)) continue;

    // Strip leading bullet / list markers: "- ", "* ", "• "
    let cleaned = line.replace(/^[-*•]\s*/, '').trim();
    if (!cleaned) continue;

    // Pattern: "[4x] Card Name" or "[4x]Card Name" (square brackets format)
    let m = cleaned.match(/^\[\s*(\d+)\s*[xX×]\s*\]\s*(.+)$/);
    if (m) {
      entries.push({ quantity: parseInt(m[1], 10), name: m[2].replace(/\s*[-–—]\s*[A-Z]{2,}[-]\d+.*$/i, '').trim(), raw: line });
      continue;
    }

    // Pattern: "3x Card Name" or "3x Card Name - SET-NUM"
    m = cleaned.match(/^(\d+)\s*[xX×]\s+(.+)$/);
    if (m) {
      entries.push({ quantity: parseInt(m[1], 10), name: m[2].replace(/\s*[-–—]\s*[A-Z]{2,}[-]\d+.*$/i, '').trim(), raw: line });
      continue;
    }

    // Pattern: "Card Name x3" or "Card Name ×3"
    m = cleaned.match(/^(.+?)\s*[xX×]\s*(\d+)$/);
    if (m) {
      entries.push({ quantity: parseInt(m[2], 10), name: m[1].replace(/\s*[-–—]\s*[A-Z]{2,}[-]\d+.*$/i, '').trim(), raw: line });
      continue;
    }

    // Pattern: "3 Card Name" (number prefix)
    m = cleaned.match(/^(\d+)\s+([A-Za-z].+)$/);
    if (m) {
      entries.push({ quantity: parseInt(m[1], 10), name: m[2].replace(/\s*[-–—]\s*[A-Z]{2,}[-]\d+.*$/i, '').trim(), raw: line });
      continue;
    }

    // Pattern: just a card name (default qty 1)
    if (/^[A-Za-zÀ-ÿ]/.test(cleaned) && cleaned.length > 1) {
      entries.push({ quantity: 1, name: cleaned.replace(/\s*[-–—]\s*[A-Z]{2,}[-]\d+.*$/i, '').trim(), raw: line });
    }
  }
  return entries;
}

export default function CollectionDetailView({ collectionId }: { collectionId: string }) {
  const { currentCollection, fetchCollection, addToCollection, loading, error } = useCollectionStore();
  const { authReady, isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'items'>('dashboard');
  const [seeding, setSeeding] = useState(false);

  // ── Manual add card state ──
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<any[]>([]);
  const [cardSearching, setCardSearching] = useState(false);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);

  // ── File import state ──
  const [showImport, setShowImport] = useState(false);
  const [importDragOver, setImportDragOver] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'importing' | 'done' | 'error'>('idle');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, matched: 0, failed: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authReady && isAuthenticated) {
      fetchCollection(collectionId);
    }
  }, [authReady, collectionId, fetchCollection, isAuthenticated]);

  const items = currentCollection?.items || [];
  const totalCards = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPurchase = items.reduce((sum, item) => sum + (item.purchase_price || 0) * item.quantity, 0);
  const detailRedirect = encodeURIComponent(`/collections/detail?id=${collectionId}`);

  const handleSeed = async () => {
    setSeeding(true);
    for (const item of sampleInventory) {
      await addToCollection(collectionId, { ...item, condition: 'NM' });
    }
    await fetchCollection(collectionId);
    setSeeding(false);
    setActiveTab('items');
  };

  // ── Manual card search ──
  const handleSearchCards = async (query: string) => {
    setCardSearchQuery(query);
    if (query.length < 2) { setCardSearchResults([]); return; }
    setCardSearching(true);
    try {
      const response = await api.searchCards({ q: query, limit: 10 });
      setCardSearchResults(response.success && response.data?.cards ? response.data.cards : []);
    } catch { setCardSearchResults([]); }
    finally { setCardSearching(false); }
  };

  const handleAddCard = async (cardId: string) => {
    setAddingCardId(cardId);
    try {
      await addToCollection(collectionId, { card_id: cardId, quantity: 1, condition: 'NM' });
      await fetchCollection(collectionId);
    } finally { setAddingCardId(null); }
  };

  // ── File import logic ──
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    readFile(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }, []);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setImportText(text);
      const entries = parseInventoryText(text);
      setParsedEntries(entries);
      setImportStatus(entries.length > 0 ? 'idle' : 'error');
    };
    reader.readAsText(file);
  };

  const handleTextParse = () => {
    const entries = parseInventoryText(importText);
    setParsedEntries(entries);
    setImportStatus(entries.length > 0 ? 'idle' : 'error');
  };

  const handleStartImport = async () => {
    if (parsedEntries.length === 0) return;
    setImportStatus('importing');
    setImportProgress({ current: 0, total: parsedEntries.length, matched: 0, failed: 0 });
    setImportErrors([]);

    // Use bulk import endpoint — single request, no rate limit issues
    try {
      const batchSize = 50;
      let totalMatched = 0;
      let totalFailed = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < parsedEntries.length; i += batchSize) {
        const batch = parsedEntries.slice(i, i + batchSize);
        setImportProgress({ current: Math.min(i + batchSize, parsedEntries.length), total: parsedEntries.length, matched: totalMatched, failed: totalFailed });

        const response = await api.bulkImportByName(
          collectionId,
          batch.map(e => ({ name: e.name, quantity: e.quantity }))
        );

        if (response.success && response.data) {
          totalMatched += response.data.matched;
          totalFailed += response.data.failed;
          allErrors.push(...(response.data.errors || []));
        } else {
          totalFailed += batch.length;
          allErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${response.error || 'unknown error'}`);
        }
      }

      setImportProgress({ current: parsedEntries.length, total: parsedEntries.length, matched: totalMatched, failed: totalFailed });
      setImportErrors(allErrors);
    } catch (err: any) {
      setImportErrors([`Fatal error: ${err.message || 'unknown'}`]);
    }

    setImportStatus('done');
    await fetchCollection(collectionId);
  };

  const resetImport = () => {
    setImportText('');
    setParsedEntries([]);
    setImportStatus('idle');
    setImportProgress({ current: 0, total: 0, matched: 0, failed: 0 });
    setImportErrors([]);
  };

  if (!authReady || (loading && (!currentCollection || currentCollection.id !== collectionId))) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="border border-border bg-card p-8 text-center">
        <Package className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Login untuk membuka inventory</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Detail collection hanya bisa dibuka oleh pemilik akun karena dipakai untuk scoring rekomendasi deck.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href={`/login?redirect=${detailRedirect}`} className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Login</a>
          <a href={`/register?redirect=${detailRedirect}`} className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm font-semibold hover:bg-accent">Daftar</a>
        </div>
      </section>
    );
  }

  if (!currentCollection || currentCollection.id !== collectionId) {
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
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Personal Collection</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {totalCards} total cards dari {items.length} kartu unik. Data ini dipakai sebagai inventory source PokeLab.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setShowAddCard(true); setCardSearchQuery(''); setCardSearchResults([]); }}
            className="inline-flex h-10 items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-4 text-sm font-semibold text-blue-400 hover:bg-blue-500/15">
            <Plus className="mr-2 h-4 w-4" /> Tambah Kartu
          </button>
          <button onClick={() => { setShowImport(true); resetImport(); }}
            className="inline-flex h-10 items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-400 hover:bg-amber-500/15">
            <Upload className="mr-2 h-4 w-4" /> Import File
          </button>
          {items.length === 0 && (
            <button onClick={handleSeed} disabled={seeding}
              className="inline-flex h-10 items-center rounded-md border border-green-500/30 bg-green-500/10 px-4 text-sm font-semibold text-green-400 hover:bg-green-500/15 disabled:opacity-60">
              {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Isi sample meta
            </button>
          )}
          <a href={`/lab/recommendations?collection_id=${collectionId}`}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <FlaskConical className="mr-2 h-4 w-4" /> Analisis deck
          </a>
          <div className="flex bg-muted p-1 rounded-lg">
            <button onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <BarChart3 className="h-4 w-4" /> Insight
            </button>
            <button onClick={() => setActiveTab('items')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'items' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
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

      {error && <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="pt-4">
        {activeTab === 'dashboard' ? (
          <PortfolioDashboard collectionId={collectionId} />
        ) : (
          <CollectionItems items={items} onSeed={handleSeed} seeding={seeding} />
        )}
      </div>

      {/* ─── Add Card Search Modal ─── */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddCard(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Tambah Kartu Manual</h3>
              <button onClick={() => setShowAddCard(false)} className="p-1 rounded-md hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" value={cardSearchQuery} onChange={e => handleSearchCards(e.target.value)}
                placeholder="Cari nama kartu (contoh: Pikachu, Charizard ex)..."
                className="h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm" autoFocus />
            </div>
            {cardSearching && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mencari kartu...
              </div>
            )}
            {!cardSearching && cardSearchQuery.length >= 2 && cardSearchResults.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">Kartu tidak ditemukan. Coba kata kunci lain.</div>
            )}
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {cardSearchResults.map(card => (
                <div key={card.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                  <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded border border-border bg-muted">
                    {card.image_url ? <img src={card.image_url} alt={card.name_id} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs">🃏</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{card.name_id}</p>
                    <p className="text-xs text-muted-foreground">{card.expansion_code} {card.rarity ? `- ${card.rarity}` : ''} {card.collector_number ? `#${card.collector_number}` : ''}</p>
                  </div>
                  <button onClick={() => handleAddCard(card.id)} disabled={addingCardId === card.id}
                    className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    {addingCardId === card.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Import File Modal ─── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowImport(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Import Inventory dari File</h3>
              <button onClick={() => setShowImport(false)} className="p-1 rounded-md hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>

            {importStatus === 'idle' && parsedEntries.length === 0 && (
              <>
                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setImportDragOver(true); }}
                  onDragLeave={() => setImportDragOver(false)}
                  onDrop={handleFileDrop}
                  className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${importDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className={`h-10 w-10 mb-3 ${importDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm font-semibold">Drag & drop file inventory di sini</p>
                  <p className="text-xs text-muted-foreground mt-1">.txt, .md, atau file teks lainnya</p>
                  <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.text" onChange={handleFileSelect} className="hidden" />
                </div>

                {/* Or paste text */}
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Atuh paste langsung di sini:</p>
                  <textarea
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    placeholder={`Contoh format:\n3x Pikachu ex\n2 Charizard ex\n1 Munkidori\n\natau:\n- 3x Pikachu ex (SV8s-056)\n- 2x Charizard ex (SV3a-125)`}
                    className="h-40 w-full rounded-md border border-input bg-background p-3 text-sm font-mono resize-y"
                  />
                  <button onClick={handleTextParse} disabled={!importText.trim()}
                    className="mt-2 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    <FileText className="mr-2 h-4 w-4" /> Parse Text
                  </button>
                </div>
              </>
            )}

            {importStatus === 'idle' && parsedEntries.length > 0 && (
              <>
                <div className="mb-4 rounded-lg border border-border bg-background p-4">
                  <p className="text-sm font-semibold mb-1">{parsedEntries.length} kartu terdeteksi</p>
                  <p className="text-xs text-muted-foreground">Kartu akan dicari berdasarkan nama lalu ditambahkan ke collection.</p>
                </div>
                <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-3">
                  {parsedEntries.map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 rounded px-3 py-1.5 text-sm even:bg-muted/30">
                      <span className="font-mono text-xs text-muted-foreground w-8 text-right">{entry.quantity}x</span>
                      <span className="font-medium truncate">{entry.name}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={handleStartImport}
                    className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                    <Upload className="mr-2 h-4 w-4" /> Import {parsedEntries.length} Kartu
                  </button>
                  <button onClick={resetImport}
                    className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-accent">
                    Reset
                  </button>
                </div>
              </>
            )}

            {importStatus === 'importing' && (
              <div className="py-8 text-center">
                <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
                <p className="text-sm font-semibold">Mengimport kartu...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {importProgress.current} / {importProgress.total} diproses — {importProgress.matched} berhasil, {importProgress.failed} gagal
                </p>
                <div className="mt-4 mx-auto max-w-xs h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} />
                </div>
              </div>
            )}

            {importStatus === 'done' && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                  <Sparkles className="h-7 w-7 text-green-500" />
                </div>
                <p className="text-lg font-bold">Import Selesai!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {importProgress.matched} kartu berhasil ditambahkan{importProgress.failed > 0 && `, ${importProgress.failed} gagal`}.
                </p>
                {importErrors.length > 0 && (
                  <div className="mt-4 mx-auto max-w-md text-left rounded-lg border border-destructive/30 bg-destructive/5 p-3 max-h-40 overflow-y-auto">
                    <p className="text-xs font-semibold text-destructive mb-2">Gagal ditambahkan:</p>
                    {importErrors.map((err, i) => <p key={i} className="text-xs text-destructive/80">• {err}</p>)}
                  </div>
                )}
                <div className="mt-4 flex justify-center gap-2">
                  <button onClick={() => { resetImport(); setShowImport(false); }}
                    className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                    Selesai
                  </button>
                  <button onClick={resetImport}
                    className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-accent">
                    Import Lagi
                  </button>
                </div>
              </div>
            )}

            {importStatus === 'error' && (
              <div className="py-6 text-center">
                <p className="text-sm text-destructive font-semibold">Tidak ada kartu yang terdeteksi dari text.</p>
                <p className="text-xs text-muted-foreground mt-1">Pastikan format benar: "3x Nama Kartu" atau "Nama Kartu" per baris.</p>
                <button onClick={resetImport} className="mt-3 inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-accent">Coba Lagi</button>
              </div>
            )}
          </div>
        </div>
      )}
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
          Isi sample meta, tambah kartu manual, atau import dari file untuk mencoba PokeLab.
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
                {card?.image_url ? (
                  <img src={cardImageSrc(card.image_url)} alt={card.name_id || item.card_id} className="h-full w-full object-cover" onError={(event) => setPlaceholderImage(event.currentTarget)} />
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
